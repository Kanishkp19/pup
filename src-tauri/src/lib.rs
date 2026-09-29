pub mod commands;
pub mod cursor;
pub mod generated_consts;
pub mod kinematics;
pub mod motion;
pub mod persist;
pub mod settings;
pub mod shortcuts;
pub mod state;
pub mod tray;
pub mod window;

use std::sync::Arc;
use tauri_plugin_autostart::MacosLauncher;

pub fn run() {
    let app_state = Arc::new(commands::AppState::new());
    let window_mgr = Arc::clone(&app_state.window_manager);
    let cursor_tracker = Arc::clone(&app_state.cursor_tracker);
    let motion_state = Arc::clone(&app_state);

    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--autostart"]),
        ))
        .plugin(tauri_plugin_global_shortcut::Builder::default().build())
        .manage(app_state)
        .setup(move |app| {
            #[cfg(target_os = "macos")]
            {
                use tauri::ActivationPolicy;
                let _ = app.set_activation_policy(ActivationPolicy::Accessory);
            }

            let handle = app.handle().clone();
            commands::hydrate_from_disk(&handle, &motion_state);

            // A manual launch is an explicit request to see the pet: if a past
            // session persisted `visible: false`, un-hide it now (and persist
            // the correction) so the app never boots into an empty screen.
            {
                use tauri::Manager;
                let st = motion_state.settings.read().clone();
                if !st.visible {
                    if let Some(w) = handle.get_webview_window("pet") {
                        let _ = w.show();
                    }
                    motion_state.settings.write().visible = true;
                    persist::save_settings(&handle, &motion_state.settings.read().clone());
                }
                if st.mini_mode {
                    // apply mini scale right away so the size is correct on boot
                    if let Some(w) = handle.get_webview_window("pet") {
                        let _ = window_mgr.set_scale(&w, st.scale * 0.5);
                    }
                } else {
                    if let Some(w) = handle.get_webview_window("pet") {
                        let _ = window_mgr.set_scale(&w, st.scale);
                    }
                }
            }

            cursor_tracker.start(handle.clone(), window_mgr);

            // ONE global menu-event listener for context menu + tray menu.
            // Handles: sleep/wake toggle, mini, mute, hide, settings, quit.
            {
                use tauri::Emitter;
                handle.on_menu_event(move |app_handle, event| {
                    let action = event.id().as_ref().to_string();
                    match action.as_str() {
                        "quit" => app_handle.exit(0),
                        "settings" => commands::open_settings_window(app_handle),
                        "sleep" | "wake" | "mini" | "mute" | "hide" | "show" => {
                            let _ = app_handle.emit("menu://action", serde_json::json!({ "action": action }));
                        }
                        _ => {}
                    }
                });
            }

            // Window motion: walking, drag-follow, gravity fall
            motion::start_motion_thread(handle, motion_state);

            if let Err(e) = tray::setup_tray(&app.handle()) {
                log::warn!("Failed to setup tray: {}", e);
            }

            if let Err(e) = shortcuts::setup_shortcuts(&app.handle()) {
                log::warn!("Failed to setup shortcuts: {}", e);
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_settings,
            commands::update_settings,
            commands::reset_settings,
            commands::get_pet_state,
            commands::save_pet_state,
            commands::get_stage,
            commands::set_hitbox,
            commands::set_window_scale,
            commands::move_to,
            commands::stop_move,
            commands::set_position,
            commands::begin_drag,
            commands::end_drag,
            commands::start_fall,
            commands::set_cursor_rate,
            commands::show_context_menu,
            commands::set_tray_state,
            commands::show_pet,
            commands::hide_pet,
            commands::open_settings,
            commands::reveal_data_dir,
            commands::quit_app
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
