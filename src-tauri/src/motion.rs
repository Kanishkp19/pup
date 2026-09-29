use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition};

use crate::kinematics::step_horizontal;

/// Background thread that owns all window motion:
///   1. walking toward `move_target` along the work-area ground (60 Hz)
///   2. drag-follow (window sticks to cursor while grabbed)
///   3. gravity fall with one 25% bounce after a drag release
/// Parked (1 Hz) while nothing is happening, per docs/06 §Phase 4.
pub fn start_motion_thread(app: AppHandle, state: Arc<crate::commands::AppState>) {
    std::thread::spawn(move || {
        let mut last_tick = Instant::now();
        let mut parked = false;

        loop {
            let move_target = state.move_target.read().clone();
            let dragging = state.is_dragging.read().clone();
            let falling_vy = state.is_falling.read().clone();
            let active = move_target.is_some() || dragging.is_some() || falling_vy.is_some();

            if !active {
                if !parked {
                    parked = true;
                    last_tick = Instant::now();
                }
                std::thread::sleep(Duration::from_millis(200));
                continue;
            }
            parked = false;

            let now = Instant::now();
            let dt = now.duration_since(last_tick).as_secs_f64().min(0.1);
            last_tick = now;

            let Some(window) = app.get_webview_window("pet") else {
                std::thread::sleep(Duration::from_millis(100));
                continue;
            };

            let Ok(win_pos) = window.outer_position() else {
                std::thread::sleep(Duration::from_millis(100));
                continue;
            };
            let mut last_emitted = (win_pos.x, win_pos.y);
            let mut emitted_this_tick = false;
            let scale_factor = window.scale_factor().unwrap_or(1.0);
            let win_size = window.outer_size().unwrap_or(tauri::PhysicalSize::new(256, 256));
            let _scale = *state.window_manager.current_scale.read();

            // Current monitor bounds for this window position
            let (mon_x, mon_y, mon_w, mon_h, work_left, work_right) =
                work_area_for(&app, win_pos.x as f64 + win_size.width as f64 / 2.0);

            // ---- 1. Drag follow -------------------------------------------
            if let Some((grab_x, grab_y)) = dragging {
                if let Ok(cursor) = app.cursor_position() {
                    // Keep the exact grab point under the cursor: the frontend sent
                    // logical (CSS px) offsets inside the window, scale them up.
                    let target_x = cursor.x as f64 - grab_x * scale_factor;
                    let target_y = cursor.y as f64 - grab_y * scale_factor;
                    let _ = window.set_position(PhysicalPosition::new(
                        target_x.round() as i32,
                        target_y.round() as i32,
                    ));
                    emitted_this_tick = true;
                }
                if emitted_this_tick {
                    emit_moved(&app, &window, &mut last_emitted);
                }
                continue;
            }

            // ---- 2. Drop handling: stay where dropped ---------------------
            // The pet remains exactly where the user left it (free placement).
            // `is_falling` is kept for API compatibility but performs no motion.
            if falling_vy.is_some() {
                *state.is_falling.write() = None;
                let _ = app.emit(
                    "pet://landed",
                    serde_json::json!({ "x": win_pos.x, "y": win_pos.y }),
                );
                continue;
            }

            // ---- 3. Walking (2D: toward target x AND y, no ground snapping) ----
            if let Some((target_x, target_y, speed_logical)) = move_target {
                let (new_x, arrived_x) = step_horizontal(
                    win_pos.x as f64,
                    target_x,
                    speed_logical,
                    scale_factor,
                    dt,
                );
                // Vertical component scales with horizontal progress so diagonal
                // paths feel natural; clamp y into the monitor's work area.
                let dy_total = target_y - win_pos.y as f64;
                let dx_total = (target_x - win_pos.x as f64).abs();
                let step_y = if dx_total > 1.0 {
                    dy_total * ((new_x - win_pos.x as f64).abs() / dx_total)
                } else if arrived_x {
                    dy_total
                } else {
                    0.0
                };
                let new_y = (win_pos.y as f64 + step_y)
                    .clamp(mon_y, mon_y + mon_h - win_size.height as f64);

                // Clamp into the current monitor work area
                let clamped = new_x.clamp(work_left, work_right - win_size.width as f64);

                let _ = window.set_position(PhysicalPosition::new(
                    clamped.round() as i32,
                    new_y.round() as i32,
                ));
                emit_moved(&app, &window, &mut last_emitted);

                if arrived_x && (target_y - new_y).abs() < 2.0 {
                    *state.move_target.write() = None;
                    let _ = app.emit(
                        "pet://arrived",
                        serde_json::json!({ "x": clamped.round() as i32, "y": new_y.round() as i32 }),
                    );
                }
            } else {
                let _ = (mon_x, mon_w);
                std::thread::sleep(Duration::from_millis(50));
            }
        }
    });
}

/// Nudge helper: the motion loop polls at 200 ms while parked, so a walk or
/// drag command can take up to 200 ms to be noticed. Emitting a wake tick via
/// a short sleep-loop here is unnecessary — the poll rate is fine for feel —
/// but we keep a hook for future event-driven wakeups.
pub fn motion_kick(_app: &AppHandle) {}

/// Emit `pet://moved` with the current window position, but only when it
/// actually changed since the last emit (keeps the event bus quiet).
fn emit_moved(
    app: &AppHandle,
    window: &tauri::WebviewWindow,
    last: &mut (i32, i32),
) {
    if let Ok(pos) = window.outer_position() {
        if (pos.x, pos.y) != *last {
            *last = (pos.x, pos.y);
            let _ = app.emit(
                "pet://moved",
                serde_json::json!({ "x": pos.x, "y": pos.y }),
            );
        }
    }
}

/// Resolve the bounds of the monitor containing the pet window.
/// Returns (mon_x, mon_y, mon_w, mon_h, work_left, work_right) in physical px.
fn work_area_for(
    app: &AppHandle,
    _center_x_physical: f64,
) -> (f64, f64, f64, f64, f64, f64) {
    if let Some(window) = app.get_webview_window("pet") {
        if let Ok(Some(mon)) = window.current_monitor() {
            let pos = mon.position();
            let size = mon.size();
            return (
                pos.x as f64,
                pos.y as f64,
                size.width as f64,
                size.height as f64,
                pos.x as f64,
                pos.x as f64 + size.width as f64,
            );
        }
    }
    // Fallback: primary-ish assumptions
    (0.0, 0.0, 1920.0, 1080.0, 0.0, 1920.0)
}
