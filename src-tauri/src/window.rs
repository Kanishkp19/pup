use serde::{Deserialize, Serialize};
use parking_lot::RwLock;
use tauri::{WebviewWindow, LogicalSize, PhysicalPosition};

use crate::generated_consts::WINDOW_LOGICAL_PX;
use crate::kinematics::ground_y;

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorInfo {
    pub id: usize,
    pub name: Option<String>,
    pub is_primary: bool,
    pub scale_factor: f64,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub work_area: Rect,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Stage {
    pub monitors: Vec<MonitorInfo>,
    pub active_monitor_id: usize,
    pub scale_factor: f64,
    pub window: Rect,
    pub ground_y: f64,
    pub feet_y_logical: f64,
}

pub struct WindowManager {
    pub current_scale: RwLock<f64>,
    pub hitbox: RwLock<Option<Rect>>,
    pub is_ignoring_cursor: RwLock<bool>,
}

impl WindowManager {
    pub fn new() -> Self {
        Self {
            current_scale: RwLock::new(1.0),
            hitbox: RwLock::new(None),
            is_ignoring_cursor: RwLock::new(true),
        }
    }

    pub fn set_hitbox(&self, rect: Option<Rect>) {
        *self.hitbox.write() = rect;
    }

    pub fn get_hitbox(&self) -> Option<Rect> {
        *self.hitbox.read()
    }

    pub fn set_scale(&self, window: &WebviewWindow, scale: f64) -> Result<(), String> {
        let scale = (scale * 10.0).round() / 10.0;
        let scale = scale.clamp(0.5, 2.0);

        let size = (WINDOW_LOGICAL_PX as f64) * scale;
        window
            .set_size(LogicalSize::new(size, size))
            .map_err(|e| e.to_string())?;

        *self.current_scale.write() = scale;
        Ok(())
    }

    pub fn set_ignore_cursor_events(&self, window: &WebviewWindow, ignore: bool) -> Result<(), String> {
        let mut current = self.is_ignoring_cursor.write();
        if *current != ignore {
            window.set_ignore_cursor_events(ignore).map_err(|e| e.to_string())?;
            *current = ignore;
        }
        Ok(())
    }

    pub fn get_stage(&self, window: &WebviewWindow) -> Result<Stage, String> {
        let available_monitors = window.available_monitors().map_err(|e| e.to_string())?;
        let primary_monitor = window.primary_monitor().map_err(|e| e.to_string())?;
        let current_monitor = window.current_monitor().map_err(|e| e.to_string())?;

        let mut monitors = Vec::new();
        let mut active_monitor_id = 0;

        for (idx, mon) in available_monitors.iter().enumerate() {
            let pos = mon.position();
            let size = mon.size();
            let scale_factor = mon.scale_factor();
            let is_primary = primary_monitor.as_ref().map(|p| p.name() == mon.name()).unwrap_or(idx == 0);

            if current_monitor.as_ref().map(|c| c.name() == mon.name()).unwrap_or(false) {
                active_monitor_id = idx;
            }

            let work_area = Rect {
                x: pos.x as f64,
                y: pos.y as f64,
                width: size.width as f64,
                height: (size.height as f64 - (48.0 * scale_factor)).max(100.0),
            };

            monitors.push(MonitorInfo {
                id: idx,
                name: mon.name().map(|s| s.to_string()),
                is_primary,
                scale_factor,
                x: pos.x,
                y: pos.y,
                width: size.width,
                height: size.height,
                work_area,
            });
        }

        let cur_mon = monitors.get(active_monitor_id).cloned().unwrap_or_else(|| {
            MonitorInfo {
                id: 0,
                name: Some("default".to_string()),
                is_primary: true,
                scale_factor: 1.0,
                x: 0,
                y: 0,
                width: 1920,
                height: 1080,
                work_area: Rect { x: 0.0, y: 0.0, width: 1920.0, height: 1032.0 },
            }
        });

        let win_pos = window.outer_position().unwrap_or(PhysicalPosition::new(0, 0));
        let win_size = window.outer_size().unwrap_or(tauri::PhysicalSize::new(256, 256));
        let scale = *self.current_scale.read();

        let ground = ground_y(
            cur_mon.work_area.y + cur_mon.work_area.height,
            scale,
            cur_mon.scale_factor,
        );

        Ok(Stage {
            monitors,
            active_monitor_id,
            scale_factor: cur_mon.scale_factor,
            window: Rect {
                x: win_pos.x as f64,
                y: win_pos.y as f64,
                width: win_size.width as f64,
                height: win_size.height as f64,
            },
            ground_y: ground,
            feet_y_logical: crate::generated_consts::FEET_Y_LOGICAL as f64,
        })
    }
}
