import type {
  PetState,
  Settings,
  Stage,
  CursorTickPayload,
} from "../shared/types";

let tauriInvoke: (<T>(cmd: string, args?: Record<string, unknown>) => Promise<T>) | null = null;
let tauriListen: (<T>(event: string, handler: (event: { payload: T }) => void) => Promise<() => void>) | null = null;

async function initTauri() {
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    try {
      const core = await import("@tauri-apps/api/core");
      const event = await import("@tauri-apps/api/event");
      tauriInvoke = core.invoke;
      tauriListen = event.listen;
    } catch {
      // Running in browser dev mode without Tauri
    }
  }
}
void initTauri();

export const ipc = {
  async getSettings(): Promise<Settings> {
    if (tauriInvoke) {
      try {
        return await tauriInvoke<Settings>("get_settings");
      } catch (e) {
        console.warn("get_settings error:", e);
      }
    }
    // Fallback defaults
    return {
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
  },

  async updateSettings(patch: Partial<Settings>): Promise<Settings | null> {
    if (tauriInvoke) {
      try {
        return await tauriInvoke<Settings>("update_settings", { patch });
      } catch (e) {
        console.warn("update_settings error:", e);
      }
    }
    return null;
  },

  async getPetState(): Promise<PetState | null> {
    if (tauriInvoke) {
      try {
        return await tauriInvoke<PetState>("get_pet_state");
      } catch (e) {
        console.warn("get_pet_state error:", e);
      }
    }
    return null;
  },

  async savePetState(state: PetState): Promise<void> {
    if (tauriInvoke) {
      try {
        await tauriInvoke("save_pet_state", { newState: state });
      } catch (e) {
        console.warn("save_pet_state error:", e);
      }
    }
  },

  async getStage(): Promise<Stage> {
    if (tauriInvoke) {
      try {
        return await tauriInvoke<Stage>("get_stage");
      } catch (e) {
        console.warn("get_stage error:", e);
      }
    }
    return {
      monitors: [],
      activeMonitorId: 0,
      scaleFactor: 1.0,
      window: { x: 400, y: 700, width: 256, height: 256 },
      groundY: 700,
      feetYLogical: 242,
    };
  },

  async setHitbox(rect: { x: number; y: number; width: number; height: number } | null): Promise<void> {
    if (tauriInvoke) {
      try {
        await tauriInvoke("set_hitbox", { rect });
      } catch {}
    }
  },

  async setWindowScale(scale: number): Promise<void> {
    if (tauriInvoke) {
      try {
        await tauriInvoke("set_window_scale", { scale });
      } catch {}
    }
  },

  async moveTo(x: number, speed: number): Promise<void> {
    if (tauriInvoke) {
      try {
        await tauriInvoke("move_to", { x, speed });
      } catch {}
    }
  },

  async stopMove(): Promise<void> {
    if (tauriInvoke) {
      try {
        await tauriInvoke("stop_move");
      } catch {}
    }
  },

  async setCursorRate(mode: "active" | "idle" | "sleep" | "off"): Promise<void> {
    if (tauriInvoke) {
      try {
        await tauriInvoke("set_cursor_rate", { mode });
      } catch {}
    }
  },

  async onCursorTick(callback: (payload: CursorTickPayload) => void): Promise<() => void> {
    if (tauriListen) {
      try {
        return await tauriListen<CursorTickPayload>("cursor://tick", (e) => callback(e.payload));
      } catch {}
    }
    return () => {};
  },

  async onSettingsChanged(callback: (settings: Settings) => void): Promise<() => void> {
    if (tauriListen) {
      try {
        return await tauriListen<Settings>("settings://changed", (e) => callback(e.payload));
      } catch {}
    }
    return () => {};
  },

  async onMenuAction(callback: (action: string) => void): Promise<() => void> {
    if (tauriListen) {
      try {
        return await tauriListen<{ action: string }>("menu://action", (e) => callback(e.payload.action));
      } catch {}
    }
    return () => {};
  },
};
