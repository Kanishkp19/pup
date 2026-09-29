pub mod commands;
pub mod cursor;
pub mod generated_consts;
pub mod kinematics;
pub mod settings;
pub mod shortcuts;
pub mod state;
pub mod tray;
pub mod window;

use std::sync::Arc;
use tauri_plugin_autostart::MacosLauncher;

pub fn run() {
    let app_state = commands::AppState::new();
    let window_mgr = Arc::clone(&app_state.window_manager);
    let cursor_tracker = Arc::clone(&app_state.cursor_tracker);

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
            cursor_tracker.start(handle, window_mgr);

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
