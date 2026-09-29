use std::sync::Arc;
use tauri::{AppHandle, Wry};
use tauri_plugin_store::{Store, StoreBuilder};

use crate::settings::Settings;
use crate::state::PetState;

const SETTINGS_FILE: &str = "puppy-store.json";
const SETTINGS_KEY: &str = "settings";
const PET_STATE_KEY: &str = "petState";

/// Load settings from the JSON store, falling back to defaults.
pub fn load_settings(app: &AppHandle) -> Settings {
    match open_store(app) {
        Some(store) => match store.get(SETTINGS_KEY) {
            Some(value) => serde_json::from_value(value).unwrap_or_else(|e| {
                log::warn!("settings corrupt, using defaults: {e}");
                Settings::default()
            }),
            None => Settings::default(),
        },
        None => Settings::default(),
    }
}

/// Persist settings to disk (debounce is handled by callers).
pub fn save_settings(app: &AppHandle, settings: &Settings) {
    if let Some(store) = open_store(app) {
        match serde_json::to_value(settings) {
            Ok(value) => {
                store.set(SETTINGS_KEY, value);
                let _ = store.save();
            }
            Err(e) => log::warn!("settings serialize failed: {e}"),
        }
    }
}

/// Load the persisted pet needs state, if any.
pub fn load_pet_state(app: &AppHandle) -> Option<PetState> {
    let store = open_store(app)?;
    let value = store.get(PET_STATE_KEY)?;
    match serde_json::from_value(value) {
        Ok(state) => Some(state),
        Err(e) => {
            log::warn!("pet state corrupt, ignoring: {e}");
            None
        }
    }
}

/// Persist the pet needs state to disk.
pub fn save_pet_state(app: &AppHandle, state: &PetState) {
    if let Some(store) = open_store(app) {
        if let Ok(value) = serde_json::to_value(state) {
            store.set(PET_STATE_KEY, value);
            let _ = store.save();
        }
    }
}

fn open_store(app: &AppHandle) -> Option<Arc<Store<Wry>>> {
    StoreBuilder::new(app, SETTINGS_FILE)
        .build()
        .ok()
}
