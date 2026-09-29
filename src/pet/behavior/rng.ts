export interface Rng {
  next(): number; // [0, 1)
  nextInt(min: number, max: number): number; // [min, max] inclusive
  nextFloat(min: number, max: number): number;
  chance(probability: number): boolean;
  pick<T>(items: readonly T[]): T;
  weightedPick<T>(items: readonly { item: T; weight: number }[]): T;
  shuffle<T>(items: T[]): T[];
}

export interface Clock {
  now(): number; // epoch ms
}

export class SeededRng implements Rng {
  private s: number;

  constructor(seed: number = 1337) {
    this.s = seed >>> 0;
  }

  // Mulberry32 generator
  public next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(this.s ^ (this.s >>> 15), 1 | this.s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  public nextInt(min: number, max: number): number {
    const l = Math.ceil(min);
    const h = Math.floor(max);
    return Math.floor(this.next() * (h - l + 1)) + l;
  }

  public nextFloat(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  public chance(probability: number): boolean {
    return this.next() < probability;
  }

  public pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error("Cannot pick from empty array");
    const idx = Math.floor(this.next() * items.length);
    return items[idx]!;
  }

  public weightedPick<T>(items: readonly { item: T; weight: number }[]): T {
    if (items.length === 0) throw new Error("Cannot pick from empty array");
    const totalWeight = items.reduce((sum, i) => sum + i.weight, 0);
    let r = this.next() * totalWeight;
    for (const entry of items) {
      if (r < entry.weight) return entry.item;
      r -= entry.weight;
    }
    return items[items.length - 1]!.item;
  }

  public shuffle<T>(items: T[]): T[] {
    const arr = [...items];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const temp = arr[i]!;
      arr[i] = arr[j]!;
      arr[j] = temp;
    }
    return arr;
  }
}

export class SystemClock implements Clock {
  public now(): number {
    return Date.now();
  }
}

export class MockClock implements Clock {
  private time: number;

  constructor(initialTime: number = 1000000) {
    this.time = initialTime;
  }

  public now(): number {
    return this.time;
  }

  public advance(ms: number) {
    this.time += ms;
  }

  public set(time: number) {
    this.time = time;
  }
}
