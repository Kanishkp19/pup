use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};

use crate::window::WindowManager;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CursorRateMode {
    Active,
    Idle,
    Sleep,
    Off,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CursorTickPayload {
    pub x: f64,
    pub y: f64,
    pub ts: u64,
    pub buttons: u32,
}

pub struct CursorTracker {
    mode: RwLock<CursorRateMode>,
    running: AtomicBool,
    consecutive_errors: AtomicU32,
    was_inside: AtomicBool,
}

impl CursorTracker {
    pub fn new() -> Self {
        Self {
            mode: RwLock::new(CursorRateMode::Active),
            running: AtomicBool::new(false),
            consecutive_errors: AtomicU32::new(0),
            was_inside: AtomicBool::new(false),
        }
    }

    pub fn set_mode(&self, new_mode: CursorRateMode) {
        *self.mode.write() = new_mode;
    }

    pub fn start(self: Arc<Self>, app: AppHandle, window_mgr: Arc<WindowManager>) {
        if self.running.swap(true, Ordering::SeqCst) {
            return;
        }

        std::thread::spawn(move || {
            while self.running.load(Ordering::SeqCst) {
                let current_mode = *self.mode.read();
                let poll_interval = match current_mode {
                    CursorRateMode::Active => Duration::from_millis(33), // ~30 Hz
                    CursorRateMode::Idle => Duration::from_millis(100),  // 10 Hz
                    CursorRateMode::Sleep => Duration::from_millis(250), // 4 Hz
                    CursorRateMode::Off => Duration::from_millis(500),   // Paused
                };

                if current_mode == CursorRateMode::Off {
                    std::thread::sleep(poll_interval);
                    continue;
                }

                if let Some(window) = app.get_webview_window("pet") {
                    match app.cursor_position() {
                        Ok(pos) => {
                            self.consecutive_errors.store(0, Ordering::Relaxed);
                            let now = SystemTime::now()
                                .duration_since(UNIX_EPOCH)
                                .map(|d| d.as_millis() as u64)
                                .unwrap_or(0);

                            // Emit cursor tick
                            let payload = CursorTickPayload {
                                x: pos.x,
                                y: pos.y,
                                ts: now,
                                buttons: 0,
                            };
                            let _ = app.emit("cursor://tick", payload);

                            // Hit-testing
                            if let (Ok(win_pos), Ok(scale_factor)) = (window.outer_position(), window.scale_factor()) {
                                let local_x = (pos.x - win_pos.x as f64) / scale_factor;
                                let local_y = (pos.y - win_pos.y as f64) / scale_factor;

                                if let Some(hitbox) = window_mgr.get_hitbox() {
                                    let was_in = self.was_inside.load(Ordering::Relaxed);
                                    let hysteresis = if was_in { 6.0 } else { 0.0 };

                                    let inside = local_x >= (hitbox.x - hysteresis)
                                        && local_x <= (hitbox.x + hitbox.width + hysteresis)
                                        && local_y >= (hitbox.y - hysteresis)
                                        && local_y <= (hitbox.y + hitbox.height + hysteresis);

                                    self.was_inside.store(inside, Ordering::Relaxed);
                                    let _ = window_mgr.set_ignore_cursor_events(&window, !inside);
                                } else {
                                    let _ = window_mgr.set_ignore_cursor_events(&window, true);
                                    self.was_inside.store(false, Ordering::Relaxed);
                                }
                            }
                        }
                        Err(e) => {
                            let errors = self.consecutive_errors.fetch_add(1, Ordering::Relaxed) + 1;
                            if errors == 20 {
                                log::warn!("Cursor polling failing repeatedly: {}", e);
                                let _ = app.emit("app://degraded", serde_json::json!({ "reason": "cursor_polling_failed" }));
                            }
                        }
                    }
                }

                std::thread::sleep(poll_interval);
            }
        });
    }

    pub fn stop(&self) {
        self.running.store(false, Ordering::SeqCst);
    }
}
