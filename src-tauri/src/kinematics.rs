use crate::generated_consts::FEET_Y_LOGICAL;

/// Calculates the physical window Y coordinate so that the puppy's feet rest on the work area ground.
///
/// Formula from docs/02-TRD.md §3:
/// `window_y_logical = work_area_bottom_logical - (FEET_Y_LOGICAL * scale)`
/// Physical Y = (work_area_bottom_physical / scale_factor - FEET_Y_LOGICAL * scale) * scale_factor
///            = work_area_bottom_physical - (FEET_Y_LOGICAL as f64 * scale * scale_factor)
pub fn ground_y(work_area_bottom_physical: f64, scale: f64, scale_factor: f64) -> f64 {
    work_area_bottom_physical - (FEET_Y_LOGICAL as f64 * scale * scale_factor)
}

/// Advance horizontal position along the ground toward target_x (physical) with speed (logical px/s).
/// Returns (new_x_physical, arrived)
pub fn step_horizontal(
    current_x: f64,
    target_x: f64,
    speed_logical_px_per_sec: f64,
    scale_factor: f64,
    dt_seconds: f64,
) -> (f64, bool) {
    let speed_physical = speed_logical_px_per_sec * scale_factor;
    let max_dist = speed_physical * dt_seconds;
    let dist = target_x - current_x;

    if dist.abs() <= max_dist {
        (target_x, true)
    } else {
        (current_x + dist.signum() * max_dist, false)
    }
}

/// Simulates one gravity step for falling.
/// Returns (new_y, new_vy, landed)
pub fn step_gravity(
    current_y: f64,
    current_vy_logical: f64,
    ground_y: f64,
    scale_factor: f64,
    dt_seconds: f64,
) -> (f64, f64, bool) {
    const GRAVITY_LOGICAL: f64 = 2400.0; // px/s^2 per 04-UI-UX-ART-BIBLE.md §4
    let gravity_physical = GRAVITY_LOGICAL * scale_factor;
    let new_vy = current_vy_logical * scale_factor + gravity_physical * dt_seconds;
    let new_y = current_y + new_vy * dt_seconds;

    if new_y >= ground_y {
        (ground_y, 0.0, true)
    } else {
        (new_y, new_vy / scale_factor, false)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ground_y_various_scales_and_dpi() {
        let work_area_bottom = 1080.0; // 1080p

        // scale 1.0, scaleFactor 1.0
        let gy_1_1 = ground_y(work_area_bottom, 1.0, 1.0);
        assert_eq!(gy_1_1, 1080.0 - 242.0); // 838.0

        // scale 0.5, scaleFactor 1.0
        let gy_05_1 = ground_y(work_area_bottom, 0.5, 1.0);
        assert_eq!(gy_05_1, 1080.0 - 121.0); // 959.0

        // scale 2.0, scaleFactor 1.0
        let gy_2_1 = ground_y(work_area_bottom, 2.0, 1.0);
        assert_eq!(gy_2_1, 1080.0 - 484.0); // 596.0

        // scale 1.0, scaleFactor 2.0 (e.g., Retina 2160 physical bottom)
        let retina_bottom = 2160.0;
        let gy_1_2 = ground_y(retina_bottom, 1.0, 2.0);
        assert_eq!(gy_1_2, 2160.0 - (242.0 * 2.0)); // 1676.0

        // scale 1.0, scaleFactor 1.5
        let gy_1_15 = ground_y(1620.0, 1.0, 1.5);
        assert_eq!(gy_1_15, 1620.0 - (242.0 * 1.5));
    }

    #[test]
    fn test_step_horizontal() {
        let current_x = 100.0;
        let target_x = 200.0;
        let speed = 50.0; // logical px/s
        let scale_factor = 1.0;

        let (new_x, arrived) = step_horizontal(current_x, target_x, speed, scale_factor, 1.0);
        assert_eq!(new_x, 150.0);
        assert!(!arrived);

        let (final_x, arrived_final) = step_horizontal(new_x, target_x, speed, scale_factor, 1.0);
        assert_eq!(final_x, 200.0);
        assert!(arrived_final);
    }

    #[test]
    fn test_step_gravity() {
        let current_y = 100.0;
        let ground = 500.0;
        let (y1, vy1, landed1) = step_gravity(current_y, 0.0, ground, 1.0, 0.1);
        assert!(y1 > current_y);
        assert!(vy1 > 0.0);
        assert!(!landed1);

        // Huge drop
        let (y_land, _, landed2) = step_gravity(490.0, 500.0, ground, 1.0, 0.1);
        assert_eq!(y_land, ground);
        assert!(landed2);
    }
}
