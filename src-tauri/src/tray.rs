use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter,
};

pub fn setup_tray(app: &AppHandle) -> Result<(), String> {
    let sleep_item = MenuItemBuilder::with_id("sleep", "Sleep").build(app).map_err(|e| e.to_string())?;
    let mute_item = MenuItemBuilder::with_id("mute", "Mute").build(app).map_err(|e| e.to_string())?;
    let mini_item = MenuItemBuilder::with_id("mini", "Mini Mode").build(app).map_err(|e| e.to_string())?;
    let hide_item = MenuItemBuilder::with_id("hide", "Hide Pet").build(app).map_err(|e| e.to_string())?;
    let settings_item = MenuItemBuilder::with_id("settings", "Settings...").build(app).map_err(|e| e.to_string())?;
    let quit_item = MenuItemBuilder::with_id("quit", "Quit PUPPY").build(app).map_err(|e| e.to_string())?;

    let menu = MenuBuilder::new(app)
        .items(&[
            &sleep_item,
            &mute_item,
            &mini_item,
            &hide_item,
            &settings_item,
            &quit_item,
        ])
        .build()
        .map_err(|e| e.to_string())?;

    let _tray = TrayIconBuilder::new()
        .menu(&menu)
        .show_menu_on_left_click(false)
        // Menu item clicks are handled by the ONE global listener in lib.rs
        // (this avoids double-firing and keeps context/tray behavior identical).
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                let _ = app.emit("menu://action", serde_json::json!({ "action": "show" }));
            }
        })
        .build(app)
        .map_err(|e| e.to_string())?;

    Ok(())
}
