import type { AnimationName, Camera } from "../generated/animations";

export type { AnimationName, Camera };

export type Facing = "left" | "right";
export type SoundId =
  | "bark"
  | "yip"
  | "happy"
  | "purr"
  | "kiss"
  | "sneeze"
  | "yawn"
  | "whimper"
  | "pop"
  | "thud"
  | "snore";

export type Personality = "happy" | "lazy" | "chaotic" | "affectionate" | "chill";

export type BehaviorState =
  | "IDLE"
  | "WANDER"
  | "CURIOUS"
  | "CHASING_CURSOR"
  | "PAW_REACH"
  | "PETTING"
  | "KISSING"
  | "HAPPY"
  | "EXCITED"
  | "SURPRISED"
  | "SCARED"
  | "SAD"
  | "BORED"
  | "FUNNY_YAWN"
  | "FUNNY_SCRATCH"
  | "FUNNY_STRETCH"
  | "FUNNY_SNEEZE"
  | "FUNNY_ROLL"
  | "FUNNY_BARK"
  | "SLEEPING"
  | "WAKING"
  | "DRAGGED"
  | "FALLING"
  | "ATTENTION"
  | "TV_WATCH"
  | "TV_LAUGH"
  | "BALL_POUNCE"
  | "DANCE"
  | "CHASE_TAIL"
  | "HUNGRY";

export interface CursorInfo {
  x: number; // window-local logical px, smoothed
  y: number;
  dx: number;
  dy: number;
  distance: number;
  speed: number;
  approaching: boolean;
  dwellCuriousMs: number;
  dwellNearMs: number;
  look: "center" | "left" | "right" | "up" | "down";
}

export interface CursorTickPayload {
  x: number;
  y: number;
  ts: number;
  buttons: number;
}

export interface PointerEvents {
  clicks: { x: number; y: number; inFaceZone: boolean; t: number }[];
  doubleClick: boolean;
  dragStart: boolean;
  dragEnd: boolean;
  rightClick: boolean;
  pettingActive: boolean;
  overBody: boolean;
  spamClicks: boolean;
}

export interface UserPresence {
  stillMs: number;
  returned: boolean;
  systemResumed: boolean;
}

export interface MoveIntent {
  targetX: number; // physical
  targetY?: number; // physical; omit to stay level with the current position
  speed: number; // logical px/s
}

export type FxSpawn =
  | { kind: "hearts"; count: number; big?: boolean }
  | { kind: "zzz" }
  | { kind: "sparkles"; count: number }
  | { kind: "exclaim" }
  | { kind: "question" }
  | { kind: "dizzy" }
  | { kind: "dust" }
  | { kind: "laugh" }
  | { kind: "ball"; x: number }  // window-local logical px of the ball spawn
  | { kind: "note" };

export interface SoundCue {
  id: SoundId;
  volumeScale?: number;
}

export interface BubbleSpec {
  text: string;
  durationMs: number;
}

export interface StageInfo {
  scale: number;
  scaleFactor: number;
  ground: boolean;
  nearTopEdge: boolean;
  window: { x: number; y: number; width: number; height: number };
}

export interface Settings {
  schemaVersion: 1;
  name: string;
  personality: Personality;
  scale: number;
  alwaysOnTop: boolean;
  startWithSystem: boolean;
  monitor: "auto" | "primary" | number;
  cursorInteraction: boolean;
  pettingEnabled: boolean;
  randomBehaviours: boolean;
  speechBubbles: boolean;
  wakeOnReturn: boolean;
  soundEnabled: boolean;
  volume: number;
  fpsCap: 15 | 30 | 60;
  lowPowerMode: boolean;
  reduceMotion: boolean;
  miniMode: boolean;
  visible: boolean;
  position: { x: number; y: number } | null;
  previousScale: number | null;
  firstRunDone: boolean;
}

export interface PetState {
  schemaVersion: 1;
  energy: number;
  boredom: number;
  affection: number;
  asleep: boolean;
  savedAt: number;
  lastInteractionAt: number;
  cooldownsUntil: Record<string, number>;
  lastBubbleAt: number;
}

export interface MonitorInfo {
  id: number;
  name: string | null;
  isPrimary: boolean;
  scaleFactor: number;
  x: number;
  y: number;
  width: number;
  height: number;
  workArea: { x: number; y: number; width: number; height: number };
}

export interface Stage {
  monitors: MonitorInfo[];
  activeMonitorId: number;
  scaleFactor: number;
  window: { x: number; y: number; width: number; height: number };
  groundY: number;
  feetYLogical: number;
}

export interface AnimationManifestItem {
  strip: string;
  frames: number;
  frameWidth: number;
  frameHeight: number;
  fps: number;
  loop: boolean;
  frameMs: number[];
  camera: Camera;
  mirrorable: boolean;
  bbox: [number, number, number, number][];
  soundCue?: { frame: number; sound: string } | null;
}

export interface AnimationManifest {
  version: number;
  canvas: number;
  baseline: number;
  centerX: number;
  display: number;
  window: number;
  feetYLogical: number;
  specSha256: string;
  animations: Record<string, AnimationManifestItem>;
}
