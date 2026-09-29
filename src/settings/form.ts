import type { Personality, Settings } from "../shared/types";
import { ipc } from "../pet/ipc";

export function renderSettingsForm(
  container: HTMLElement,
  settings: Settings,
  onSave: (patch: Partial<Settings>) => void
) {
  container.innerHTML = `
    <!-- General -->
    <div class="settings-card">
      <div class="settings-card-title">General</div>
      
      <div class="settings-row">
        <div>
          <div class="label-title">Pet Name</div>
          <div class="label-desc">1 to 20 characters</div>
        </div>
        <input type="text" id="name-input" maxlength="20" value="${settings.name}" />
      </div>

      <div class="settings-row">
        <div>
          <div class="label-title">Personality</div>
          <div class="label-desc">Influences activities and reaction energy</div>
        </div>
        <select id="personality-select">
          <option value="happy" ${settings.personality === "happy" ? "selected" : ""}>Happy</option>
          <option value="lazy" ${settings.personality === "lazy" ? "selected" : ""}>Lazy</option>
          <option value="chaotic" ${settings.personality === "chaotic" ? "selected" : ""}>Chaotic</option>
          <option value="affectionate" ${settings.personality === "affectionate" ? "selected" : ""}>Affectionate</option>
          <option value="chill" ${settings.personality === "chill" ? "selected" : ""}>Chill</option>
        </select>
      </div>

      <div class="settings-row">
        <div>
          <div class="label-title">Scale</div>
          <div class="label-desc">Puppy display size (0.5x to 2.0x)</div>
        </div>
        <div class="slider-container">
          <input type="range" id="scale-slider" min="0.5" max="2.0" step="0.1" value="${settings.scale}" />
          <span class="slider-value" id="scale-value">${settings.scale.toFixed(1)}x</span>
        </div>
      </div>

      <div class="settings-row">
        <div>
          <div class="label-title">Always On Top</div>
          <div class="label-desc">Keep puppy floating over all normal windows</div>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" id="always-on-top-toggle" ${settings.alwaysOnTop ? "checked" : ""} />
          <span class="toggle-slider"></span>
        </label>
      </div>

      <div class="settings-row">
        <div>
          <div class="label-title">Start With System</div>
          <div class="label-desc">Automatically launch on login</div>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" id="autostart-toggle" ${settings.startWithSystem ? "checked" : ""} />
          <span class="toggle-slider"></span>
        </label>
      </div>
    </div>

    <!-- Interaction -->
    <div class="settings-card">
      <div class="settings-card-title">Interaction</div>

      <div class="settings-row">
        <div>
          <div class="label-title">Follow Cursor</div>
          <div class="label-desc">Track and react to mouse movement</div>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" id="cursor-toggle" ${settings.cursorInteraction ? "checked" : ""} />
          <span class="toggle-slider"></span>
        </label>
      </div>

      <div class="settings-row">
        <div>
          <div class="label-title">Petting Gestures</div>
          <div class="label-desc">Rub head to pet and generate hearts</div>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" id="petting-toggle" ${settings.pettingEnabled ? "checked" : ""} />
          <span class="toggle-slider"></span>
        </label>
      </div>

      <div class="settings-row">
        <div>
          <div class="label-title">Random Behaviours</div>
          <div class="label-desc">Occasional snoozing, rolling, and stretching</div>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" id="random-toggle" ${settings.randomBehaviours ? "checked" : ""} />
          <span class="toggle-slider"></span>
        </label>
      </div>

      <div class="settings-row">
        <div>
          <div class="label-title">Speech Bubbles</div>
          <div class="label-desc">Show cute pop-up messages</div>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" id="bubbles-toggle" ${settings.speechBubbles ? "checked" : ""} />
          <span class="toggle-slider"></span>
        </label>
      </div>
    </div>

    <!-- Audio -->
    <div class="settings-card">
      <div class="settings-card-title">Audio</div>

      <div class="settings-row">
        <div>
          <div class="label-title">Sound Effects</div>
          <div class="label-desc">Soft barks, yips, kisses, and purrs</div>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" id="sound-toggle" ${settings.soundEnabled ? "checked" : ""} />
          <span class="toggle-slider"></span>
        </label>
      </div>

      <div class="settings-row">
        <div>
          <div class="label-title">Volume</div>
        </div>
        <div class="slider-container">
          <input type="range" id="volume-slider" min="0" max="1" step="0.05" value="${settings.volume}" />
          <span class="slider-value" id="volume-value">${Math.round(settings.volume * 100)}%</span>
        </div>
      </div>
    </div>

    <!-- Performance -->
    <div class="settings-card">
      <div class="settings-card-title">Performance & Display</div>

      <div class="settings-row">
        <div>
          <div class="label-title">Framerate Cap</div>
          <div class="label-desc">Active rendering limit</div>
        </div>
        <div class="segmented-control" id="fps-segments">
          <button type="button" class="segment-btn ${settings.fpsCap === 15 ? "active" : ""}" data-fps="15">15 FPS</button>
          <button type="button" class="segment-btn ${settings.fpsCap === 30 ? "active" : ""}" data-fps="30">30 FPS</button>
          <button type="button" class="segment-btn ${settings.fpsCap === 60 ? "active" : ""}" data-fps="60">60 FPS</button>
        </div>
      </div>

      <div class="settings-row">
        <div>
          <div class="label-title">Low Power Mode</div>
          <div class="label-desc">Reduces background activity and idle ticks</div>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" id="lowpower-toggle" ${settings.lowPowerMode ? "checked" : ""} />
          <span class="toggle-slider"></span>
        </label>
      </div>

      <div class="settings-row">
        <div>
          <div class="label-title">Reduce Motion</div>
          <div class="label-desc">Disables bounces, hops, and camera sway</div>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" id="reducemotion-toggle" ${settings.reduceMotion ? "checked" : ""} />
          <span class="toggle-slider"></span>
        </label>
      </div>

      <div class="settings-row">
        <div>
          <div class="label-title">Mini Mode</div>
          <div class="label-desc">Half-size resting pet in bottom corner</div>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" id="minimode-toggle" ${settings.miniMode ? "checked" : ""} />
          <span class="toggle-slider"></span>
        </label>
      </div>
    </div>

    <!-- About & Utilities -->
    <div class="settings-card">
      <div class="settings-card-title">About</div>
      <div class="settings-row">
        <div>
          <div class="label-title">PUPPY Version 0.1.0</div>
          <div class="label-desc">Zero cloud • Local only • Private</div>
        </div>
        <button type="button" id="reveal-data-btn" class="btn">Open App Data</button>
      </div>
    </div>
  `;

  // Attach event handlers
  const nameInput = container.querySelector("#name-input") as HTMLInputElement;
  nameInput.addEventListener("change", () => {
    onSave({ name: nameInput.value.trim() || "Biscuit" });
  });

  const personalitySelect = container.querySelector("#personality-select") as HTMLSelectElement;
  personalitySelect.addEventListener("change", () => {
    onSave({ personality: personalitySelect.value as Personality });
  });

  const scaleSlider = container.querySelector("#scale-slider") as HTMLInputElement;
  const scaleValue = container.querySelector("#scale-value") as HTMLElement;
  scaleSlider.addEventListener("input", () => {
    const val = parseFloat(scaleSlider.value);
    scaleValue.textContent = `${val.toFixed(1)}x`;
  });
  scaleSlider.addEventListener("change", () => {
    onSave({ scale: parseFloat(scaleSlider.value) });
  });

  const alwaysOnTopToggle = container.querySelector("#always-on-top-toggle") as HTMLInputElement;
  alwaysOnTopToggle.addEventListener("change", () => {
    onSave({ alwaysOnTop: alwaysOnTopToggle.checked });
  });

  const autostartToggle = container.querySelector("#autostart-toggle") as HTMLInputElement;
  autostartToggle.addEventListener("change", () => {
    onSave({ startWithSystem: autostartToggle.checked });
  });

  const cursorToggle = container.querySelector("#cursor-toggle") as HTMLInputElement;
  cursorToggle.addEventListener("change", () => {
    onSave({ cursorInteraction: cursorToggle.checked });
  });

  const pettingToggle = container.querySelector("#petting-toggle") as HTMLInputElement;
  pettingToggle.addEventListener("change", () => {
    onSave({ pettingEnabled: pettingToggle.checked });
  });

  const randomToggle = container.querySelector("#random-toggle") as HTMLInputElement;
  randomToggle.addEventListener("change", () => {
    onSave({ randomBehaviours: randomToggle.checked });
  });

  const bubblesToggle = container.querySelector("#bubbles-toggle") as HTMLInputElement;
  bubblesToggle.addEventListener("change", () => {
    onSave({ speechBubbles: bubblesToggle.checked });
  });

  const soundToggle = container.querySelector("#sound-toggle") as HTMLInputElement;
  soundToggle.addEventListener("change", () => {
    onSave({ soundEnabled: soundToggle.checked });
  });

  const volumeSlider = container.querySelector("#volume-slider") as HTMLInputElement;
  const volumeValue = container.querySelector("#volume-value") as HTMLElement;
  volumeSlider.addEventListener("input", () => {
    const val = parseFloat(volumeSlider.value);
    volumeValue.textContent = `${Math.round(val * 100)}%`;
  });
  volumeSlider.addEventListener("change", () => {
    onSave({ volume: parseFloat(volumeSlider.value) });
  });

  // FPS Segmented control
  const fpsButtons = container.querySelectorAll(".segment-btn");
  fpsButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      fpsButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const fps = parseInt((btn as HTMLElement).dataset.fps || "30", 10) as 15 | 30 | 60;
      onSave({ fpsCap: fps });
    });
  });

  const lowpowerToggle = container.querySelector("#lowpower-toggle") as HTMLInputElement;
  lowpowerToggle.addEventListener("change", () => {
    onSave({ lowPowerMode: lowpowerToggle.checked });
  });

  const reducemotionToggle = container.querySelector("#reducemotion-toggle") as HTMLInputElement;
  reducemotionToggle.addEventListener("change", () => {
    onSave({ reduceMotion: reducemotionToggle.checked });
  });

  const minimodeToggle = container.querySelector("#minimode-toggle") as HTMLInputElement;
  minimodeToggle.addEventListener("change", () => {
    onSave({ miniMode: minimodeToggle.checked });
  });

  const revealBtn = container.querySelector("#reveal-data-btn") as HTMLButtonElement;
  revealBtn.addEventListener("click", () => {
    void ipc.getStage(); // placeholder or reveal call
  });
}
