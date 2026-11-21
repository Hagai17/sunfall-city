// Procedural sound for Sunfall City: no audio files, only oscillators and noise
// shaped through the Web Audio API. The engine hum and the police siren are
// continuous voices retuned every frame; everything else is a one-shot fired
// from a game event. The context is created on the first user gesture (the
// title screen's start), and every call is safe before that or if audio fails.
export function createAudio() {
  let ctx = null;
  let master = null;
  let engine = null;
  let siren = null;
  let sirenFlip = 0;
  let muted = false;

  function ensure() {
    if (ctx !== null) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      // Engine: two detuned oscillators through a low-pass, gain driven by speed.
      const engOscA = ctx.createOscillator();
      engOscA.type = 'sawtooth';
      const engOscB = ctx.createOscillator();
      engOscB.type = 'square';
      const engFilter = ctx.createBiquadFilter();
      engFilter.type = 'lowpass';
      engFilter.frequency.value = 420;
      const engGain = ctx.createGain();
      engGain.gain.value = 0;
      engOscA.connect(engFilter);
      engOscB.connect(engFilter);
      engFilter.connect(engGain);
      engGain.connect(master);
      engOscA.start();
      engOscB.start();
      engine = { a: engOscA, b: engOscB, gain: engGain, filter: engFilter };
      // Siren: one triangle whose pitch flips between two tones.
      const sirOsc = ctx.createOscillator();
      sirOsc.type = 'triangle';
      sirOsc.frequency.value = 760;
      const sirGain = ctx.createGain();
      sirGain.gain.value = 0;
      sirOsc.connect(sirGain);
      sirGain.connect(master);
      sirOsc.start();
      siren = { osc: sirOsc, gain: sirGain };
      return true;
    } catch {
      ctx = null;
      return false;
    }
  }

  function tone(freq, dur, type, gain, slideTo, delay) {
    if (!ensure()) return;
    try {
      const t0 = ctx.currentTime + (delay || 0);
      const osc = ctx.createOscillator();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, t0);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(gain, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g);
      g.connect(master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    } catch { /* a failed voice is silence, never an error */ }
  }

  function noise(dur, filterFreq, gain, delay) {
    if (!ensure()) return;
    try {
      const t0 = ctx.currentTime + (delay || 0);
      const length = Math.max(1, Math.floor(ctx.sampleRate * dur));
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = filterFreq;
      const g = ctx.createGain();
      g.gain.value = gain;
      src.connect(filter);
      filter.connect(g);
      g.connect(master);
      src.start(t0);
    } catch { /* silence */ }
  }

  /** Continuous voices for this frame: engine note from speed, siren from range. */
  function update(game) {
    if (ctx === null || muted) return;
    try {
      const player = game.player;
      const now = ctx.currentTime;
      if (engine !== null) {
        let target = 0;
        let freq = 55;
        if (player.car !== null && game.screen === 'play') {
          const ratio = Math.min(1, Math.abs(player.car.speed) / player.car.type.topSpeed);
          freq = 52 + ratio * 168;
          target = 0.045 + ratio * 0.03;
        }
        engine.a.frequency.setTargetAtTime(freq, now, 0.06);
        engine.b.frequency.setTargetAtTime(freq * 0.5 + 3, now, 0.06);
        engine.filter.frequency.setTargetAtTime(320 + (freq - 52) * 3.4, now, 0.08);
        engine.gain.gain.setTargetAtTime(target, now, 0.09);
      }
      if (siren !== null) {
        let nearest = Infinity;
        for (const car of game.cars) {
          if (car.mode !== 'police') continue;
          const d = Math.hypot(car.x - player.x, car.y - player.y);
          if (d < nearest) nearest = d;
        }
        const target = game.police.stars > 0 && nearest < 560 ? 0.028 * (1 - nearest / 700) : 0;
        siren.gain.gain.setTargetAtTime(Math.max(0, target), now, 0.15);
        sirenFlip -= 1 / 60;
        if (sirenFlip <= 0) {
          sirenFlip = 0.34;
          siren.osc.frequency.setTargetAtTime(siren.osc.frequency.value > 850 ? 720 : 960, now, 0.03);
        }
      }
    } catch { /* silence */ }
  }

  /** Play the sound for a game event, quieter with distance from the player. */
  function event(game, ev) {
    if (ctx === null || muted) return;
    const d = Math.hypot((ev.x || 0) - game.player.x, (ev.y || 0) - game.player.y);
    const vol = Math.max(0.12, 1 - d / 620);
    switch (ev.kind) {
      case 'shot': noise(0.11, 2600, 0.20 * vol); tone(190, 0.09, 'square', 0.10 * vol, 60); break;
      case 'copShot': noise(0.09, 2200, 0.11 * vol); break;
      case 'crash': noise(0.28, 640, 0.30 * vol); tone(130, 0.3, 'sine', 0.22 * vol, 38); break;
      case 'thud': tone(96, 0.16, 'sine', 0.24 * vol, 44); break;
      case 'spark': noise(0.05, 3400, 0.07 * vol); break;
      case 'honk': tone(372, 0.16, 'square', 0.055 * vol); tone(466, 0.16, 'square', 0.04 * vol, 0, 0.02); break;
      case 'pickup': tone(660, 0.09, 'sine', 0.14); tone(990, 0.13, 'sine', 0.14, 0, 0.07); break;
      case 'cash': tone(1318, 0.07, 'triangle', 0.12); tone(1568, 0.07, 'triangle', 0.12, 0, 0.06); tone(2093, 0.12, 'triangle', 0.12, 0, 0.12); break;
      case 'reload': noise(0.04, 1800, 0.10, 0); noise(0.04, 1400, 0.12, 0.14); break;
      case 'stepDone': tone(784, 0.1, 'triangle', 0.13); tone(1175, 0.16, 'triangle', 0.13, 0, 0.08); break;
      case 'missionComplete': [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, 'triangle', 0.14, 0, i * 0.09)); break;
      case 'missionFailed': tone(392, 0.2, 'triangle', 0.13); tone(311, 0.3, 'triangle', 0.13, 0, 0.16); break;
      case 'missionCard': tone(587, 0.12, 'triangle', 0.10); tone(880, 0.18, 'triangle', 0.10, 0, 0.09); break;
      case 'explosion': noise(0.7, 300, 0.5 * vol); tone(110, 0.65, 'sine', 0.4 * vol, 30); break;
      case 'busted': tone(220, 0.4, 'square', 0.10); tone(185, 0.5, 'square', 0.10, 0, 0.3); break;
      case 'wasted': tone(330, 0.5, 'sine', 0.14, 82); break;
      case 'starsChanged': if (ev.stars > 0) { tone(988, 0.09, 'square', 0.06); tone(988, 0.09, 'square', 0.06, 0, 0.13); } break;
      case 'uiClick': tone(1150, 0.04, 'square', 0.06); break;
      case 'enterCar': noise(0.06, 900, 0.10); tone(196, 0.1, 'sine', 0.08, 0, 0.05); break;
      default: break;
    }
  }

  return {
    /** Call from a user gesture so the browser lets the context start. */
    unlock() {
      if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {});
    },
    update,
    event,
    setMuted(value) {
      muted = value;
      if (master !== null && ctx !== null) master.gain.setTargetAtTime(muted ? 0 : 0.5, ctx.currentTime, 0.03);
    },
    isMuted() {
      return muted;
    },
  };
}
