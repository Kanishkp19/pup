import type { AnimationName } from "../../generated/animations";
import type { AnimationManifest } from "../../shared/types";

const PINNED_ANIMATIONS: Set<string> = new Set([
  "idle_sit",
  "look_left",
  "look_right",
  "look_up",
  "look_down",
  "stand_idle",
  "walk",
  "run",
  "sit_down",
  "stand_up",
  "happy",
  "petting",
  "kiss",
]);

const MAX_CACHE_BYTES = 48 * 1024 * 1024; // 48 MB

interface CacheEntry {
  image: ImageBitmap | HTMLImageElement;
  bytes: number;
  lastUsed: number;
}

export class SpriteCache {
  private pinned = new Map<string, ImageBitmap | HTMLImageElement>();
  private lru = new Map<string, CacheEntry>();
  private currentBytes = 0;
  private _manifest: AnimationManifest | null = null;
  private loading = new Map<string, Promise<ImageBitmap | HTMLImageElement>>();

  constructor() {}

  public setManifest(manifest: AnimationManifest) {
    this._manifest = manifest;
  }

  public getManifest(): AnimationManifest | null {
    return this._manifest;
  }

  public async preloadPinned(): Promise<void> {
    const promises: Promise<any>[] = [];
    for (const name of PINNED_ANIMATIONS) {
      promises.push(this.load(name as AnimationName));
    }
    await Promise.allSettled(promises);
  }

  public get(name: AnimationName): ImageBitmap | HTMLImageElement | null {
    if (this.pinned.has(name)) {
      return this.pinned.get(name)!;
    }
    if (this.lru.has(name)) {
      const entry = this.lru.get(name)!;
      entry.lastUsed = performance.now();
      return entry.image;
    }
    void this.load(name);
    return null;
  }

  public async load(name: AnimationName): Promise<ImageBitmap | HTMLImageElement | null> {
    if (this.pinned.has(name)) return this.pinned.get(name)!;
    if (this.lru.has(name)) return this.lru.get(name)!.image;
    if (this.loading.has(name)) return this.loading.get(name)!;

    const stripPath = `/assets/sprites/${name}.png`;
    const loadPromise = this.fetchAndDecode(stripPath);
    this.loading.set(name, loadPromise);

    try {
      const img = await loadPromise;
      this.loading.delete(name);

      const width = img.width;
      const height = img.height;
      const bytes = width * height * 4;

      if (PINNED_ANIMATIONS.has(name)) {
        this.pinned.set(name, img);
      } else {
        this.evictIfNeeded(bytes);
        this.lru.set(name, { image: img, bytes, lastUsed: performance.now() });
        this.currentBytes += bytes;
      }
      return img;
    } catch (err) {
      this.loading.delete(name);
      console.warn(`Failed to load sprite strip for ${name} at ${stripPath}:`, err);
      return null;
    }
  }

  private async fetchAndDecode(url: string): Promise<ImageBitmap | HTMLImageElement> {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      if (typeof createImageBitmap !== "undefined") {
        return await createImageBitmap(blob);
      }
      return await this.loadAsHtmlImage(blob);
    } catch {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = url;
      });
    }
  }

  private loadAsHtmlImage(blob: Blob): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Image decode failed"));
      };
      img.src = url;
    });
  }

  private evictIfNeeded(incomingBytes: number) {
    while (this.currentBytes + incomingBytes > MAX_CACHE_BYTES && this.lru.size > 0) {
      let oldestKey: string | null = null;
      let oldestTime = Infinity;

      for (const [key, entry] of this.lru.entries()) {
        if (entry.lastUsed < oldestTime) {
          oldestTime = entry.lastUsed;
          oldestKey = key;
        }
      }

      if (oldestKey) {
        const entry = this.lru.get(oldestKey)!;
        this.currentBytes -= entry.bytes;
        this.lru.delete(oldestKey);
      } else {
        break;
      }
    }
  }
}
