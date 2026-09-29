use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Personality {
    Happy,
    Lazy,
    Chaotic,
    Affectionate,
    Chill,
}

impl Default for Personality {
    fn default() -> Self {
        Personality::Happy
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum MonitorChoice {
    Named(String),
    Id(i32),
}

impl Default for MonitorChoice {
    fn default() -> Self {
        MonitorChoice::Named("auto".to_string())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Position {
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub schema_version: u32,
    pub name: String,
    pub personality: Personality,
    pub scale: f64,
    pub always_on_top: bool,
    pub start_with_system: bool,
    pub monitor: MonitorChoice,
    pub cursor_interaction: bool,
    pub petting_enabled: bool,
    pub random_behaviours: bool,
    pub speech_bubbles: bool,
    pub wake_on_return: bool,
    pub sound_enabled: bool,
    pub volume: f64,
    pub fps_cap: u32,
    pub low_power_mode: bool,
    pub reduce_motion: bool,
    pub mini_mode: bool,
    pub visible: bool,
    pub position: Option<Position>,
    pub previous_scale: Option<f64>,
    pub first_run_done: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            schema_version: 1,
            name: "Biscuit".to_string(),
            personality: Personality::Happy,
            scale: 1.0,
            always_on_top: true,
            start_with_system: true,
            monitor: MonitorChoice::default(),
            cursor_interaction: true,
            petting_enabled: true,
            random_behaviours: true,
            speech_bubbles: true,
            wake_on_return: true,
            sound_enabled: true,
            volume: 0.5,
            fps_cap: 30,
            low_power_mode: false,
            reduce_motion: false,
            mini_mode: false,
            visible: true,
            position: None,
            previous_scale: None,
            first_run_done: false,
        }
    }
}

impl Settings {
    pub fn sanitize(&mut self) {
        self.schema_version = 1;

        // Trim name and validate length
        let trimmed = self.name.trim();
        if trimmed.is_empty() || trimmed.len() > 20 {
            self.name = "Biscuit".to_string();
        } else {
            self.name = trimmed.to_string();
        }

        // Clamp scale to [0.5, 2.0] rounded to 0.1
        let rounded_scale = (self.scale * 10.0).round() / 10.0;
        self.scale = rounded_scale.clamp(0.5, 2.0);

        // Clamp volume to [0.0, 1.0]
        self.volume = self.volume.clamp(0.0, 1.0);

        // Coerce fps_cap to nearest of 15, 30, 60
        let caps = [15, 30, 60];
        let mut nearest = 30;
        let mut min_diff = i64::MAX;
        for &cap in &caps {
            let diff = (self.fps_cap as i64 - cap as i64).abs();
            if diff < min_diff {
                min_diff = diff;
                nearest = cap;
            }
        }
        self.fps_cap = nearest;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_settings() {
        let s = Settings::default();
        assert_eq!(s.name, "Biscuit");
        assert_eq!(s.scale, 1.0);
        assert_eq!(s.volume, 0.5);
        assert_eq!(s.fps_cap, 30);
        assert_eq!(s.personality, Personality::Happy);
    }

    #[test]
    fn test_sanitization_scale_and_volume() {
        let mut s = Settings {
            scale: 2.5,
            volume: 1.5,
            ..Default::default()
        };
        s.sanitize();
        assert_eq!(s.scale, 2.0);
        assert_eq!(s.volume, 1.0);

        let mut s2 = Settings {
            scale: 0.1,
            volume: -0.5,
            ..Default::default()
        };
        s2.sanitize();
        assert_eq!(s2.scale, 0.5);
        assert_eq!(s2.volume, 0.0);

        let mut s3 = Settings {
            scale: 1.26,
            ..Default::default()
        };
        s3.sanitize();
        assert_eq!(s3.scale, 1.3);
    }

    #[test]
    fn test_sanitization_name() {
        let mut s = Settings {
            name: "   ".to_string(),
            ..Default::default()
        };
        s.sanitize();
        assert_eq!(s.name, "Biscuit");

        let mut s2 = Settings {
            name: "ThisNameIsFarTooLongToBeValidForAPet".to_string(),
            ..Default::default()
        };
        s2.sanitize();
        assert_eq!(s2.name, "Biscuit");

        let mut s3 = Settings {
            name: "  Mochi  ".to_string(),
            ..Default::default()
        };
        s3.sanitize();
        assert_eq!(s3.name, "Mochi");
    }

    #[test]
    fn test_sanitization_fps_cap() {
        let mut s = Settings {
            fps_cap: 20,
            ..Default::default()
        };
        s.sanitize();
        assert_eq!(s.fps_cap, 15);

        let mut s2 = Settings {
            fps_cap: 45,
            ..Default::default()
        };
        s2.sanitize();
        assert_eq!(s2.fps_cap, 30);

        let mut s3 = Settings {
            fps_cap: 120,
            ..Default::default()
        };
        s3.sanitize();
        assert_eq!(s3.fps_cap, 60);
    }
}
