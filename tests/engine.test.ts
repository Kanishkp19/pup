import { describe, it, expect, beforeEach } from "vitest";
import { BehaviorEngine } from "../src/pet/behavior/engine";
import type { EngineInputs } from "../src/pet/behavior/engine";
import { MockClock, SeededRng } from "../src/pet/behavior/rng";
import type { Settings } from "../src/shared/types";

describe("BehaviorEngine", () => {
  let rng: SeededRng;
  let clock: MockClock;
  let defaultSettings: Settings;
  let baseInputs: EngineInputs;

  beforeEach(() => {
    rng = new SeededRng(42);
    clock = new MockClock(1000000);
    defaultSettings = {
      schemaVersion: 1,
      name: "Biscuit",
      personality: "happy",
      scale: 1.0,
      alwaysOnTop: true,
      startWithSystem: true,
      monitor: "auto",
      cursorInteraction: true,
      pettingEnabled: true,
      randomBehaviours: true,
      speechBubbles: true,
      wakeOnReturn: true,
      soundEnabled: true,
      volume: 0.5,
      fpsCap: 30,
      lowPowerMode: false,
      reduceMotion: false,
      miniMode: false,
      visible: true,
      position: null,
      previousScale: null,
      firstRunDone: true,
    };

    baseInputs = {
      cursor: null,
      pointer: {
        clicks: [],
        doubleClick: false,
        dragStart: false,
        dragEnd: false,
        rightClick: false,
        pettingActive: false,
        overBody: false,
        spamClicks: false,
      },
      presence: { stillMs: 0, returned: false, systemResumed: false },
      stage: {
        scale: 1.0,
        scaleFactor: 1.0,
        ground: true,
        nearTopEdge: false,
        window: { x: 500, y: 800, width: 256, height: 256 },
      },
      settings: defaultSettings,
    };
  });

  it("starts in IDLE state", () => {
    const engine = new BehaviorEngine({ rng, clock, settings: defaultSettings });
    expect(engine.getState()).toBe("IDLE");
  });

  it("transitions to SURPRISED on spam clicks", () => {
    const engine = new BehaviorEngine({ rng, clock, settings: defaultSettings });
    const inputs = {
      ...baseInputs,
      pointer: { ...baseInputs.pointer, spamClicks: true },
    };

    const out = engine.update(0.033, inputs);
    expect(out.state).toBe("SURPRISED");
    expect(out.animation).toBe("surprised");
    expect(out.fx.some((f) => f.kind === "exclaim")).toBe(true);
  });

  it("transitions to KISSING when clicking in face zone", () => {
    const engine = new BehaviorEngine({ rng, clock, settings: defaultSettings });
    const inputs = {
      ...baseInputs,
      pointer: {
        ...baseInputs.pointer,
        clicks: [{ x: 128, y: 165, inFaceZone: true, t: clock.now() }],
      },
    };

    const out = engine.update(0.033, inputs);
    expect(out.state).toBe("KISSING");
    expect(out.animation).toBe("kiss");
    expect(out.sound.some((s) => s.id === "kiss")).toBe(true);
  });

  it("transitions to DRAGGED on dragStart", () => {
    const engine = new BehaviorEngine({ rng, clock, settings: defaultSettings });
    const inputs = {
      ...baseInputs,
      pointer: { ...baseInputs.pointer, dragStart: true },
    };

    const out = engine.update(0.033, inputs);
    expect(out.state).toBe("DRAGGED");
    expect(out.animation).toBe("drag");
  });

  it("decays energy over time when awake", () => {
    const engine = new BehaviorEngine({
      rng,
      clock,
      settings: defaultSettings,
      state: { energy: 80 },
    });

    clock.advance(60000);
    engine.update(60.0, baseInputs);

    const needs = engine.getNeeds();
    expect(needs.energy).toBeLessThan(80);
    expect(needs.energy).toBeCloseTo(79, 1);
  });
});
