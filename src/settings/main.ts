import { ipc } from "../pet/ipc";
import { renderSettingsForm } from "./form";
import type { Settings } from "../shared/types";

window.addEventListener("DOMContentLoaded", async () => {
  const formContainer = document.getElementById("settings-form");
  if (!formContainer) return;

  const header = document.querySelector(".settings-header");
  let saveIndicator = document.getElementById("save-indicator");
  if (!saveIndicator && header) {
    saveIndicator = document.createElement("span");
    saveIndicator.id = "save-indicator";
    saveIndicator.className = "save-indicator";
    saveIndicator.textContent = "Saved";
    header.appendChild(saveIndicator);
  }

  let currentSettings: Settings = await ipc.getSettings();

  let saveTimer: any = null;
  const onSave = async (patch: Partial<Settings>) => {
    currentSettings = { ...currentSettings, ...patch };
    await ipc.updateSettings(patch);

    if (saveIndicator) {
      saveIndicator.classList.add("visible");
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        saveIndicator?.classList.remove("visible");
      }, 1200);
    }
  };

  renderSettingsForm(formContainer, currentSettings, onSave);
});
