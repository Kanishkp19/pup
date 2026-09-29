export {
  CANVAS_PX,
  BASELINE_Y_PX,
  CENTER_X_PX,
  DISPLAY_LOGICAL_PX,
  WINDOW_LOGICAL_PX,
  FEET_Y_LOGICAL,
  SPEC_SHA256,
  ANIMATION_NAMES,
  ANIMATIONS,
} from "../generated/animations";

export const GRAVITY_LOGICAL = 2400; // px/s^2
export const MAX_PARTICLES = 48;
export const SPRITE_OFFSET_X = 32; // (256 - 192) / 2
export const SPRITE_OFFSET_Y = 64; // 256 - 192

export const HEAD_CENTER_LOCAL = { x: 128, y: 130 }; // window logical px
export const HEAD_RADIUS_LOCAL = 45;
export const FACE_ZONE_RADIUS = 28;

export const BUBBLE_MAX_WIDTH = 224;
export const BUBBLE_HOLD_MS = 3500;
export const BUBBLE_FADE_MS = 200;
export const BUBBLE_POP_IN_MS = 200;
