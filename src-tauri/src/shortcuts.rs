use tauri::AppHandle;

pub fn setup_shortcuts(_app: &AppHandle) -> Result<(), String> {
    // Shortcuts will be registered via tauri-plugin-global-shortcut if enabled
    Ok(())
}
