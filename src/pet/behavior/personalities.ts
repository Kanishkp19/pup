import type { Personality } from "../../shared/types";

export interface PersonalityProfile {
  wander: number;
  funny: number;
  sleep: number;
  reaction: number;
  petGain: number;
  chase: number;
  cooldownScale: number;
  energyDecay: number;
  radiiScale: number;
}

export const PERSONALITY_PROFILES: Record<Personality, PersonalityProfile> = {
  happy: {
    wander: 1.0,
    funny: 1.0,
    sleep: 1.0,
    reaction: 1.0,
    petGain: 1.0,
    chase: 1.0,
    cooldownScale: 1.0,
    energyDecay: 1.0,
    radiiScale: 1.0,
  },
  lazy: {
    wander: 0.5,
    funny: 0.6,
    sleep: 2.0,
    reaction: 0.8,
    petGain: 1.0,
    chase: 0.5,
    cooldownScale: 1.4,
    energyDecay: 1.3,
    radiiScale: 1.0,
  },
  chaotic: {
    wander: 1.6,
    funny: 1.8,
    sleep: 0.7,
    reaction: 1.2,
    petGain: 1.0,
    chase: 1.5,
    cooldownScale: 0.6,
    energyDecay: 1.2,
    radiiScale: 1.0,
  },
  affectionate: {
    wander: 0.8,
    funny: 0.8,
    sleep: 1.0,
    reaction: 1.4,
    petGain: 1.5,
    chase: 1.0,
    cooldownScale: 1.0,
    energyDecay: 1.0,
    radiiScale: 1.3,
  },
  chill: {
    wander: 0.7,
    funny: 0.7,
    sleep: 1.4,
    reaction: 0.8,
    petGain: 1.0,
    chase: 0.6,
    cooldownScale: 1.2,
    energyDecay: 0.9,
    radiiScale: 1.0,
  },
};

export function getEffectiveProfile(personality: Personality, reduceMotion: boolean): PersonalityProfile {
  const base = PERSONALITY_PROFILES[personality] ?? PERSONALITY_PROFILES.happy;
  if (!reduceMotion) return base;

  return {
    ...base,
    wander: 0.3,
    funny: 0.3,
    chase: 0.3,
  };
}
