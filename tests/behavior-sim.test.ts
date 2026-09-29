import { describe, it, expect } from "vitest";
import { BehaviorEngine } from "../src/pet/behavior/engine";
import { SeededRng, SystemClock } from "../src/pet/behavior/rng";
import type { Settings, PointerEvents, StageInfo, CursorInfo } from "../src/shared/types";

const settings: Settings = {
  schemaVersion: 1, name: "Biscuit", personality: "happy", scale: 1.0,
  alwaysOnTop: true, startWithSystem: true, monitor: "auto",
  cursorInteraction: true, pettingEnabled: true, randomBehaviours: true,
  speechBubbles: true, wakeOnReturn: true, soundEnabled: true, volume: 0.5,
  fpsCap: 30, lowPowerMode: false, reduceMotion: false, miniMode: false,
  visible: true, position: null, previousScale: null, firstRunDone: true,
};

const stage: StageInfo = {
  scale: 1.0, scaleFactor: 1.0, ground: true, nearTopEdge: false,
  window: { x: 800, y: 900, width: 256, height: 256 },
};

const idlePointer: PointerEvents = {
  clicks: [], doubleClick: false, dragStart: false, dragEnd: false,
  rightClick: false, pettingActive: false, overBody: false, spamClicks: false,
};

describe("behavior engine simulation", () => {
  it("wanders on its own within a couple of minutes", () => {
    const engine = new BehaviorEngine({ rng: new SeededRng(), clock: new SystemClock(), settings });
    const seen = new Set<string>();
    let moveIntents = 0;
    // 5 minutes at 30fps
    for (let f = 0; f < 30 * 300; f++) {
      const out = engine.update(1 / 30, {
        cursor: null, pointer: idlePointer,
        presence: { stillMs: 9999, returned: false, systemResumed: false },
        stage, settings,
      });
      seen.add(out.state);
      if (out.moveIntent) moveIntents++;
    }
    expect(moveIntents).toBeGreaterThan(10);
    expect(seen.has("WANDER")).toBe(true);
  });

  it("emits play states (dance/tv/ball/tail) over a long idle stretch", () => {
    const engine = new BehaviorEngine({ rng: new SeededRng(42), clock: new SystemClock(), settings });
    const seen = new Set<string>();
    for (let f = 0; f < 30 * 900; f++) {
      const out = engine.update(1 / 30, {
        cursor: null, pointer: idlePointer,
        presence: { stillMs: 9999, returned: false, systemResumed: false },
        stage, settings,
      });
      seen.add(out.state);
    }
    const hasPlay = ["DANCE", "TV_WATCH", "BALL_POUNCE", "CHASE_TAIL", "ATTENTION"].some(s => seen.has(s));
    expect(hasPlay).toBe(true);
  });

  it("chases a fast approaching cursor", () => {
    const engine = new BehaviorEngine({ rng: new SeededRng(), clock: new SystemClock(), settings });
    let chased = false;
    const cursor: CursorInfo = {
      x: 160, y: 140, dx: 30, dy: 0, speed: 800, approaching: true,
      distance: 150, look: "center", dwellCuriousMs: 0, dwellNearMs: 0,
    };
    for (let f = 0; f < 30 * 60; f++) {
      const out = engine.update(1 / 30, {
        cursor, pointer: idlePointer,
        presence: { stillMs: 0, returned: false, systemResumed: false },
        stage, settings,
      });
      if (out.state === "CHASING_CURSOR") { chased = true; break; }
    }
    expect(chased).toBe(true);
  });

  it("reacts to petting and clicks", () => {
    const engine = new BehaviorEngine({ rng: new SeededRng(), clock: new SystemClock(), settings });
    const pet: PointerEvents = { ...idlePointer, pettingActive: true };
    let petted = false;
    for (let f = 0; f < 30 * 5; f++) {
      const out = engine.update(1 / 30, {
        cursor: null, pointer: pet,
        presence: { stillMs: 0, returned: false, systemResumed: false },
        stage, settings,
      });
      if (out.state === "PETTING") { petted = true; break; }
    }
    expect(petted).toBe(true);

    const click: PointerEvents = { ...idlePointer, clicks: [{ x: 128, y: 200, inFaceZone: false, t: 0 }] };
    let happy = false;
    for (let f = 0; f < 30 * 3; f++) {
      const out = engine.update(1 / 30, {
        cursor: null, pointer: click,
        presence: { stillMs: 0, returned: false, systemResumed: false },
        stage, settings,
      });
      if (out.state === "HAPPY") { happy = true; break; }
    }
    expect(happy).toBe(true);
  });

  it("does not wedge in an unknown state after 30 min", () => {
    const engine = new BehaviorEngine({ rng: new SeededRng(7), clock: new SystemClock(), settings });
    const valid = new Set([
      "IDLE","WANDER","CURIOUS","CHASING_CURSOR","PAW_REACH","PETTING","KISSING",
      "HAPPY","EXCITED","SURPRISED","SCARED","SAD","BORED","FUNNY_YAWN","FUNNY_SCRATCH",
      "FUNNY_STRETCH","FUNNY_SNEEZE","FUNNY_ROLL","FUNNY_BARK","SLEEPING","WAKING",
      "DRAGGED","FALLING","ATTENTION","TV_WATCH","TV_LAUGH","BALL_POUNCE","DANCE",
      "CHASE_TAIL","HUNGRY",
    ]);
    for (let f = 0; f < 30 * 60 * 30; f++) {
      const out = engine.update(1 / 30, {
        cursor: null, pointer: idlePointer,
        presence: { stillMs: 99999, returned: false, systemResumed: false },
        stage, settings,
      });
      expect(valid.has(out.state)).toBe(true);
    }
  });
});
