import type { SoundId } from "../../shared/types";

export function playSynthPatch(
  ctx: AudioContext,
  sound: SoundId,
  masterVolume: number = 0.5,
  volumeScale: number = 1.0
) {
  if (ctx.state === "suspended") {
    void ctx.resume();
  }

  const now = ctx.currentTime;
  const masterGain = ctx.createGain();
  const targetGain = Math.max(0, Math.min(1, masterVolume * volumeScale * 0.4));
  masterGain.gain.setValueAtTime(targetGain, now);
  masterGain.connect(ctx.destination);

  // Random pitch variation +-6%
  const pitchFactor = 1.0 + (Math.random() - 0.5) * 0.12;

  switch (sound) {
    case "bark": {
      // Two short triangle blips 520 -> 380 Hz
      for (let i = 0; i < 2; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();

        osc.type = "triangle";
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(2000, now);

        const startTime = now + i * 0.11;
        osc.frequency.setValueAtTime(520 * pitchFactor, startTime);
        osc.frequency.exponentialRampToValueAtTime(380 * pitchFactor, startTime + 0.09);

        gain.gain.setValueAtTime(0.7, startTime);
        gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.09);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(masterGain);

        osc.start(startTime);
        osc.stop(startTime + 0.09);
      }
      break;
    }

    case "yip": {
      // One triangle blip 700 -> 900 Hz, 70 ms
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(700 * pitchFactor, now);
      osc.frequency.exponentialRampToValueAtTime(900 * pitchFactor, now + 0.07);

      gain.gain.setValueAtTime(0.6, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.07);

      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(now);
      osc.stop(now + 0.07);
      break;
    }

    case "happy": {
      // Rising two-note sine chirp 660 -> 880 Hz, 120 ms
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(660 * pitchFactor, now);
      osc.frequency.setValueAtTime(880 * pitchFactor, now + 0.06);

      gain.gain.setValueAtTime(0.6, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);

      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(now);
      osc.stop(now + 0.12);
      break;
    }

    case "kiss": {
      // Short click + sine drop 400 -> 200 Hz
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(400 * pitchFactor, now);
      osc.frequency.exponentialRampToValueAtTime(200 * pitchFactor, now + 0.1);

      gain.gain.setValueAtTime(0.5, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);

      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(now);
      osc.stop(now + 0.1);
      break;
    }

    case "purr": {
      // Soft low sine with 25Hz wobble
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(140 * pitchFactor, now);

      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.6);

      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(now);
      osc.stop(now + 0.6);
      break;
    }

    case "sneeze": {
      // Bandpass sweep 800 -> 300 Hz
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(800 * pitchFactor, now);
      osc.frequency.exponentialRampToValueAtTime(300 * pitchFactor, now + 0.18);

      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.18);

      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(now);
      osc.stop(now + 0.18);
      break;
    }

    case "yawn": {
      // Slow descending sine glide 500 -> 300 Hz
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(500 * pitchFactor, now);
      osc.frequency.linearRampToValueAtTime(300 * pitchFactor, now + 1.2);

      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 1.2);

      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(now);
      osc.stop(now + 1.2);
      break;
    }

    case "whimper": {
      // Soft high sine 600 -> 420 Hz
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(600 * pitchFactor, now);
      osc.frequency.linearRampToValueAtTime(420 * pitchFactor, now + 0.6);

      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.6);

      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(now);
      osc.stop(now + 0.6);
      break;
    }

    case "pop": {
      // Crisp sine burst 800 Hz, 40 ms
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(800 * pitchFactor, now);

      gain.gain.setValueAtTime(0.5, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.04);

      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(now);
      osc.stop(now + 0.04);
      break;
    }

    case "thud": {
      // Low dull sine 90 Hz, 120 ms
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(90 * pitchFactor, now);

      gain.gain.setValueAtTime(0.8, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);

      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(now);
      osc.stop(now + 0.12);
      break;
    }

    case "snore": {
      // Soft whistling inhale: filtered saw sweep 90 -> 60 Hz over 0.5 s
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      osc.type = "sawtooth";
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(300, now);
      filter.Q.setValueAtTime(8, now);

      osc.frequency.setValueAtTime(90 * pitchFactor, now);
      osc.frequency.linearRampToValueAtTime(60 * pitchFactor, now + 0.5);
      filter.frequency.linearRampToValueAtTime(160, now + 0.5);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.5, now + 0.15);
      gain.gain.linearRampToValueAtTime(0.001, now + 0.55);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(masterGain);
      osc.start(now);
      osc.stop(now + 0.6);
      break;
    }
  }
}
