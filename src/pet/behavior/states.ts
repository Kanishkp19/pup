import type { AnimationName } from "../../generated/animations";
import type {
  BehaviorState,
  BubbleSpec,
  Facing,
  FxSpawn,
  MoveIntent,
  SoundCue,
} from "../../shared/types";

export interface StateContext {
  stateTimer: number; // ms spent in current state
  subStateIndex: number;
  targetX: number;
  facing: Facing;
}

export interface StateTickResult {
  nextState?: BehaviorState;
  animation: AnimationName;
  facing: Facing;
  moveIntent?: MoveIntent | null;
  fx?: FxSpawn[];
  sound?: SoundCue[];
  bubble?: BubbleSpec | null;
  cooldownKey?: string;
  cooldownSec?: number;
}
