use parking_lot::RwLock;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, State, WebviewUrl, WebviewWindowBuilder};

use crate::cursor::{CursorRateMode, CursorTracker};
use crate::settings::Settings;
use crate::state::PetState;
use crate::window::{Rect, Stage, WindowManager};

pub struct AppState {
    pub settings: RwLock<Settings>,
    pub pet_state: RwLock<PetState>,
    pub window_manager: Arc<WindowManager>,
    pub cursor_tracker: Arc<CursorTracker>,
    pub move_target: RwLock<Option<(f64, f64)>>, // (target_x, speed_logical)
    pub is_dragging: RwLock<Option<(f64, f64)>>, // (grab_x, grab_y)
    pub is_falling: RwLock<Option<f64>>,         // vy
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
        }
    }
}

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> Result<Settings, String> {
    Ok(state.settings.read().clone())
}

#[tauri::command]
pub fn update_settings(
    app: AppHandle,
    state: State<'_, AppState>,
    patch: serde_json::Value,
) -> Result<Settings, String> {
    let mut current = state.settings.write();
    let current_val = serde_json::to_value(&*current).map_err(|e| e.to_string())?;

    // Merge patch
    let mut merged = current_val;
    if let (Some(base_obj), Some(patch_obj)) = (merged.as_object_mut(), patch.as_object()) {
        for (k, v) in patch_obj {
            base_obj.insert(k.clone(), v.clone());
        }
    }

    let mut new_settings: Settings = serde_json::from_value(merged).map_err(|e| e.to_string())?;
    new_settings.sanitize();

    // Side effects
    if let Some(pet_window) = app.get_webview_window("pet") {
        let _ = pet_window.set_always_on_top(new_settings.always_on_top);
        let _ = state.window_manager.set_scale(&pet_window, new_settings.scale);
        if new_settings.visible {
            let _ = pet_window.show();
        } else {
            let _ = pet_window.hide();
        }
    }

    *current = new_settings.clone();
    let _ = app.emit("settings://changed", &new_settings);

    Ok(new_settings)
}

#[tauri::command]
pub fn reset_settings(app: AppHandle, state: State<'_, AppState>) -> Result<Settings, String> {
    let first_run_done = state.settings.read().first_run_done;
    let mut defaults = Settings::default();
    defaults.first_run_done = first_run_done;
    defaults.sanitize();

    *state.settings.write() = defaults.clone();
    let _ = app.emit("settings://changed", &defaults);

    Ok(defaults)
}

#[tauri::command]
pub fn get_pet_state(state: State<'_, AppState>) -> Result<PetState, String> {
    Ok(state.pet_state.read().clone())
}

#[tauri::command]
pub fn save_pet_state(state: State<'_, AppState>, new_state: PetState) -> Result<(), String> {
    let mut s = new_state;
    s.sanitize();
    *state.pet_state.write() = s;
    Ok(())
}

#[tauri::command]
pub fn get_stage(app: AppHandle, state: State<'_, AppState>) -> Result<Stage, String> {
    let window = app.get_webview_window("pet").ok_or("Window not found")?;
    state.window_manager.get_stage(&window)
}

#[tauri::command]
pub fn set_hitbox(state: State<'_, AppState>, rect: Option<Rect>) -> Result<(), String> {
    state.window_manager.set_hitbox(rect);
    Ok(())
}

#[tauri::command]
pub fn set_window_scale(app: AppHandle, state: State<'_, AppState>, scale: f64) -> Result<(), String> {
    let window = app.get_webview_window("pet").ok_or("Window not found")?;
    state.window_manager.set_scale(&window, scale)
}

#[tauri::command]
pub fn move_to(state: State<'_, AppState>, x: f64, speed: f64) -> Result<(), String> {
    *state.move_target.write() = Some((x, speed));
    Ok(())
}

#[tauri::command]
pub fn stop_move(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
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
pub fn begin_drag(state: State<'_, AppState>, grab_x: f64, grab_y: f64) -> Result<(), String> {
    *state.is_dragging.write() = Some((grab_x, grab_y));
    *state.move_target.write() = None;
    *state.is_falling.write() = None;
    Ok(())
}

#[tauri::command]
pub fn end_drag(_app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    *state.is_dragging.write() = None;
    *state.is_falling.write() = Some(0.0); // start gravity fall
    Ok(())
}

#[tauri::command]
pub fn start_fall(state: State<'_, AppState>, _from_top: Option<bool>) -> Result<(), String> {
    *state.is_falling.write() = Some(0.0);
    Ok(())
}

#[tauri::command]
pub fn set_cursor_rate(state: State<'_, AppState>, mode: CursorRateMode) -> Result<(), String> {
    state.cursor_tracker.set_mode(mode);
    Ok(())
}

#[tauri::command]
pub fn show_context_menu(_app: AppHandle, _is_asleep: bool) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub fn set_tray_state(_app: AppHandle, _asleep: bool, _muted: bool, _visible: bool) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub fn show_pet(app: AppHandle) -> Result<(), String> {
    let window = app.get_webview_window("pet").ok_or("Window not found")?;
    window.show().map_err(|e| e.to_string())?;
    let _ = app.emit("app://visibility", serde_json::json!({ "visible": true }));
    Ok(())
}

#[tauri::command]
pub fn hide_pet(app: AppHandle) -> Result<(), String> {
    let window = app.get_webview_window("pet").ok_or("Window not found")?;
    window.hide().map_err(|e| e.to_string())?;
    let _ = app.emit("app://visibility", serde_json::json!({ "visible": false }));
    Ok(())
}

#[tauri::command]
pub fn open_settings(app: AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("settings") {
        let _ = w.show();
        let _ = w.set_focus();
    } else {
        let _ = WebviewWindowBuilder::new(&app, "settings", WebviewUrl::App("settings.html".into()))
            .title("PUPPY Settings")
            .inner_size(480.0, 600.0)
            .resizable(true)
            .build();
    }
    Ok(())
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
