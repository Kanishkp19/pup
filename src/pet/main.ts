import { PuppyApp } from "./app";

window.addEventListener("DOMContentLoaded", () => {
  const canvas = document.getElementById("pet-canvas") as HTMLCanvasElement;
  if (!canvas) {
    console.error("Canvas element #pet-canvas not found!");
    return;
  }

  const app = new PuppyApp(canvas);
  void app.start();
});
