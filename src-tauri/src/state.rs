use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PetState {
    pub schema_version: u32,
    pub energy: f64,
    pub boredom: f64,
    pub affection: f64,
    pub asleep: bool,
    pub saved_at: u64,
    pub last_interaction_at: u64,
    pub cooldowns_until: HashMap<String, u64>,
    pub last_bubble_at: u64,
}

impl Default for PetState {
    fn default() -> Self {
        Self {
            schema_version: 1,
            energy: 80.0,
            boredom: 20.0,
            affection: 50.0,
            asleep: false,
            saved_at: 0,
            last_interaction_at: 0,
            cooldowns_until: HashMap::new(),
            last_bubble_at: 0,
        }
    }
}

impl PetState {
    pub fn sanitize(&mut self) {
        self.schema_version = 1;
        self.energy = self.energy.clamp(0.0, 100.0);
        self.boredom = self.boredom.clamp(0.0, 100.0);
        self.affection = self.affection.clamp(0.0, 100.0);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_pet_state() {
        let state = PetState::default();
        assert_eq!(state.energy, 80.0);
        assert_eq!(state.boredom, 20.0);
        assert_eq!(state.affection, 50.0);
        assert!(!state.asleep);
    }

    #[test]
    fn test_sanitize_state() {
        let mut state = PetState {
            energy: 150.0,
            boredom: -10.0,
            affection: 110.0,
            ..Default::default()
        };
        state.sanitize();
        assert_eq!(state.energy, 100.0);
        assert_eq!(state.boredom, 0.0);
        assert_eq!(state.affection, 100.0);
    }
}
