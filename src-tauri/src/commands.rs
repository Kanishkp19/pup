use parking_lot::RwLock;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, State, WebviewUrl, WebviewWindowBuilder};

use crate::cursor::{CursorRateMode, CursorTracker};
use crate::motion::motion_kick;
use crate::persist;
use crate::settings::Settings;
use crate::state::PetState;
use crate::window::{Rect, Stage, WindowManager};

pub struct AppState {
    pub settings: RwLock<Settings>,
    pub pet_state: RwLock<PetState>,
    pub window_manager: Arc<WindowManager>,
    pub cursor_tracker: Arc<CursorTracker>,
    pub move_target: RwLock<Option<(f64, f64, f64)>>, // (target_x, target_y, speed_logical)
    pub is_dragging: RwLock<Option<(f64, f64)>>, // (grab_x, grab_y)
    pub is_falling: RwLock<Option<f64>>,         // vy
    pub fall_bounced: std::sync::atomic::AtomicBool,
    pub app_handle: RwLock<Option<AppHandle>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            settings: RwLock::new(Settings::default()),
            pet_state: RwLock::new(PetState::default()),
            window_manager: Arc::new(WindowManager::new()),
            cursor_tracker: Arc::new(CursorTracker::new()),
            move_target: RwLock::new(None),
            is_dragging: RwLock::new(None),
            is_falling: RwLock::new(None),
            fall_bounced: std::sync::atomic::AtomicBool::new(false),
            app_handle: RwLock::new(None),
        }
    }

    /// Store the AppHandle so the motion thread can be spawned from `run()`.
    pub fn app_handle_holder(&self) -> () {
        ()
    }
}

#[tauri::command]
pub fn get_settings(state: State<'_, Arc<AppState>>) -> Result<Settings, String> {
    Ok(state.settings.read().clone())
}

/// Called from setup(): hydrate settings + pet state from disk.
pub fn hydrate_from_disk(app: &AppHandle, state: &AppState) {
    let loaded = persist::load_settings(app);
    *state.settings.write() = loaded;
    if let Some(pet) = persist::load_pet_state(app) {
        *state.pet_state.write() = pet;
    }
}

#[tauri::command]
pub fn update_settings(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    patch: serde_json::Value,
) -> Result<Settings, String> {
    // 1. Snapshot the current settings and DROP the lock immediately.
    //    (Never hold the write lock across side effects — a nested read on the
    //    same thread would self-deadlock and freeze every settings change.)
    let old = state.settings.read().clone();

    // 2. Merge the patch into the snapshot.
    let mut merged = serde_json::to_value(&old).map_err(|e| e.to_string())?;
    if let (Some(base_obj), Some(patch_obj)) = (merged.as_object_mut(), patch.as_object()) {
        for (k, v) in patch_obj {
            base_obj.insert(k.clone(), v.clone());
        }
    }
    let mut new_settings: Settings = serde_json::from_value(merged).map_err(|e| e.to_string())?;
    new_settings.sanitize();

    // 3. Side effects — diff against the snapshot, no locks held here.
    if let Some(pet_window) = app.get_webview_window("pet") {
        let _ = pet_window.set_always_on_top(new_settings.always_on_top);

        if (new_settings.scale - old.scale).abs() > f64::EPSILON {
            if let Err(e) = state.window_manager.set_scale(&pet_window, new_settings.scale) {
                log::warn!("set_scale failed (window left as-is): {e}");
            }
        }

        if new_settings.visible != old.visible {
            let _ = if new_settings.visible {
                pet_window.show()
            } else {
                pet_window.hide()
            };
        }
    }

    // 4. Commit briefly, then emit + persist.
    *state.settings.write() = new_settings.clone();
    let _ = app.emit("settings://changed", &new_settings);
    persist::save_settings(&app, &new_settings);

    Ok(new_settings)
}

#[tauri::command]
pub fn reset_settings(app: AppHandle, state: State<'_, Arc<AppState>>) -> Result<Settings, String> {
    let first_run_done = state.settings.read().first_run_done;
    let mut defaults = Settings::default();
    defaults.first_run_done = first_run_done;
    defaults.sanitize();

    *state.settings.write() = defaults.clone();
    let _ = app.emit("settings://changed", &defaults);
    persist::save_settings(&app, &defaults);

    Ok(defaults)
}

#[tauri::command]
pub fn get_pet_state(state: State<'_, Arc<AppState>>) -> Result<PetState, String> {
    Ok(state.pet_state.read().clone())
}

#[tauri::command]
pub fn save_pet_state(app: AppHandle, state: State<'_, Arc<AppState>>, new_state: PetState) -> Result<(), String> {
    let mut s = new_state;
    s.sanitize();
    *state.pet_state.write() = s.clone();
    persist::save_pet_state(&app, &s);
    Ok(())
}

#[tauri::command]
pub fn get_stage(app: AppHandle, state: State<'_, Arc<AppState>>) -> Result<Stage, String> {
    let window = app.get_webview_window("pet").ok_or("Window not found")?;
    state.window_manager.get_stage(&window)
}

#[tauri::command]
pub fn set_hitbox(state: State<'_, Arc<AppState>>, rect: Option<Rect>) -> Result<(), String> {
    state.window_manager.set_hitbox(rect);
    Ok(())
}

#[tauri::command]
pub fn set_window_scale(app: AppHandle, state: State<'_, Arc<AppState>>, scale: f64) -> Result<(), String> {
    let window = app.get_webview_window("pet").ok_or("Window not found")?;
    state.window_manager.set_scale(&window, scale)
}

#[tauri::command]
pub fn move_to(app: AppHandle, state: State<'_, Arc<AppState>>, x: f64, speed: f64, y: Option<f64>) -> Result<(), String> {
    // y omitted → walk level with the current position (no snap to ground)
    let cur_y = app
        .get_webview_window("pet")
        .and_then(|w| w.outer_position().ok())
        .map(|p| p.y as f64)
        .unwrap_or(0.0);
    *state.move_target.write() = Some((x, y.unwrap_or(cur_y), speed));
    motion_kick(&app);
    Ok(())
}

#[tauri::command]
pub fn stop_move(app: AppHandle, state: State<'_, Arc<AppState>>) -> Result<(), String> {
    *state.move_target.write() = None;
    if let Some(window) = app.get_webview_window("pet") {
        if let Ok(pos) = window.outer_position() {
            let _ = app.emit("pet://arrived", serde_json::json!({ "x": pos.x, "y": pos.y }));
        }
    }
    Ok(())
}

#[tauri::command]
pub fn set_position(app: AppHandle, x: f64, y: f64) -> Result<(), String> {
    let window = app.get_webview_window("pet").ok_or("Window not found")?;
    window
        .set_position(PhysicalPosition::new(x as i32, y as i32))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn begin_drag(app: AppHandle, state: State<'_, Arc<AppState>>, grab_x: f64, grab_y: f64) -> Result<(), String> {
    *state.is_dragging.write() = Some((grab_x, grab_y));
    *state.move_target.write() = None;
    *state.is_falling.write() = None;
    state.cursor_tracker.set_dragging(true);
    // Drag is window motion: make sure the motion thread is on it
    motion_kick(&app);
    Ok(())
}

#[tauri::command]
pub fn end_drag(app: AppHandle, state: State<'_, Arc<AppState>>) -> Result<(), String> {
    // Stay where dropped — no gravity snap to the bottom line.
    *state.is_dragging.write() = None;
    // Marker so the motion thread emits `pet://landed` (the frontend relies on
    // it to leave the FALLING animation state — without it the engine wedges).
    *state.is_falling.write() = Some(0.0);
    *state.move_target.write() = None;
    state.cursor_tracker.set_dragging(false);
    motion_kick(&app);
    Ok(())
}

#[tauri::command]
pub fn start_fall(state: State<'_, Arc<AppState>>, _from_top: Option<bool>) -> Result<(), String> {
    *state.is_falling.write() = Some(0.0);
    Ok(())
}

#[tauri::command]
pub fn set_cursor_rate(state: State<'_, Arc<AppState>>, mode: CursorRateMode) -> Result<(), String> {
    state.cursor_tracker.set_mode(mode);
    Ok(())
}

#[tauri::command]
pub fn show_context_menu(app: AppHandle, state: State<'_, Arc<AppState>>) -> Result<(), String> {
    use tauri::menu::{MenuBuilder, CheckMenuItemBuilder, MenuItemBuilder};

    let window = app.get_webview_window("pet").ok_or("Window not found")?;
    let (asleep, mini_on) = {
        let ps = state.pet_state.read();
        let st = state.settings.read();
        (ps.asleep, st.mini_mode)
    };
    let name = state.settings.read().name.clone();

    let header = MenuItemBuilder::with_id("header", &name)
        .enabled(false)
        .build(&app)
        .map_err(|e| e.to_string())?;
    let sleep_label = if asleep { "Wake up" } else { "Sleep now" };
    let sleep_item = MenuItemBuilder::with_id("sleep", sleep_label)
        .build(&app)
        .map_err(|e| e.to_string())?;
    let mini_item = CheckMenuItemBuilder::with_id("mini", "Mini Mode")
        .checked(mini_on)
        .build(&app)
        .map_err(|e| e.to_string())?;
    let hide_item = MenuItemBuilder::with_id("hide", "Hide Puppy")
        .build(&app)
        .map_err(|e| e.to_string())?;
    let settings_item = MenuItemBuilder::with_id("settings", "Settings…")
        .build(&app)
        .map_err(|e| e.to_string())?;
    let quit_item = MenuItemBuilder::with_id("quit", "Quit PUPPY")
        .build(&app)
        .map_err(|e| e.to_string())?;

    let menu = MenuBuilder::new(&app)
        .items(&[&header, &sleep_item, &mini_item, &hide_item])
        .separator()
        .items(&[&settings_item, &quit_item])
        .build()
        .map_err(|e| e.to_string())?;

    // NOTE: menu item clicks are handled by the ONE global listener registered
    // in lib.rs setup() (handles both this context menu and the tray menu).
    let _ = window.show();
    use tauri::menu::ContextMenu;
    menu.popup(window.as_ref().window().clone())
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn set_tray_state(_app: AppHandle, _asleep: bool, _muted: bool, _visible: bool) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub fn show_pet(app: AppHandle, state: State<'_, Arc<AppState>>) -> Result<(), String> {
    let window = app.get_webview_window("pet").ok_or("Window not found")?;
    window.show().map_err(|e| e.to_string())?;
    {
        let mut s = state.settings.write();
        if !s.visible {
            s.visible = true;
            let snapshot = s.clone();
            drop(s);
            persist::save_settings(&app, &snapshot);
        }
    }
    let _ = app.emit("app://visibility", serde_json::json!({ "visible": true }));
    Ok(())
}

#[tauri::command]
pub fn hide_pet(app: AppHandle, state: State<'_, Arc<AppState>>) -> Result<(), String> {
    let window = app.get_webview_window("pet").ok_or("Window not found")?;
    window.hide().map_err(|e| e.to_string())?;
    {
        let mut s = state.settings.write();
        if s.visible {
            s.visible = false;
            let snapshot = s.clone();
            drop(s);
            persist::save_settings(&app, &snapshot);
        }
    }
    let _ = app.emit("app://visibility", serde_json::json!({ "visible": false }));
    Ok(())
}

#[tauri::command]
pub fn open_settings(app: AppHandle) -> Result<(), String> {
    open_settings_window(&app);
    Ok(())
}

/// Shared settings-window opener (tray, context menu and command all use this).
pub fn open_settings_window(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("settings") {
        let _ = w.show();
        let _ = w.set_focus();
    } else {
        let _ = WebviewWindowBuilder::new(app, "settings", WebviewUrl::App("settings.html".into()))
            .title("PUPPY Settings")
            .inner_size(480.0, 600.0)
            .resizable(true)
            .build();
    }
}

#[tauri::command]
pub fn reveal_data_dir(app: AppHandle) -> Result<(), String> {
    if let Ok(app_dir) = app.path().app_data_dir() {
        #[cfg(target_os = "macos")]
        let _ = std::process::Command::new("open").arg(&app_dir).spawn();
        #[cfg(target_os = "windows")]
        let _ = std::process::Command::new("explorer").arg(&app_dir).spawn();
    }
    Ok(())
}

#[tauri::command]
pub fn quit_app(app: AppHandle) -> Result<(), String> {
    app.exit(0);
    Ok(())
}
