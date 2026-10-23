// Звуки синтезируются Web Audio API прямо в коде — внешних файлов нет.
// Браузер разрешает звук только после действия игрока, поэтому контекст создаётся в unlock().
export class Sound {
  constructor(muted) {
    this.muted = muted;
    this.ctx = null;
    this.master = null;
  }

  unlock() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.3;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.setTargetAtTime(muted ? 0 : 0.3, this.ctx.currentTime, 0.02);
  }

  play(name) {
    if (this.muted || !this.ctx) return;
    const recipe = SOUNDS[ALIASES[name] ?? name];
    if (recipe) recipe(this);
  }

  // Один тон: частота может скользить от freq к endFreq, громкость плавно гаснет
  tone(freq, { at = 0, duration = 0.15, type = 'sine', endFreq = freq, volume = 0.5 } = {}) {
    const start = this.ctx.currentTime + at;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    osc.frequency.exponentialRampToValueAtTime(endFreq, start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain).connect(this.master);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }
}

// События игры, у которых нет своего звука, а есть похожий
const ALIASES = { appear: 'caw', perch: 'caw', trash: 'crash', escaped: 'stamps' };

const SOUNDS = {
  jump: (s) => s.tone(320, { duration: 0.16, type: 'square', endFreq: 640, volume: 0.12 }),
  fish: (s) => s.tone(900, { duration: 0.09, type: 'triangle', endFreq: 1400, volume: 0.35 }),
  stamp: (s) => {
    [660, 880, 1320].forEach((f, i) => s.tone(f, { at: i * 0.07, duration: 0.18, type: 'triangle', volume: 0.35 }));
  },
  crash: (s) => {
    s.tone(180, { duration: 0.35, type: 'sawtooth', endFreq: 45, volume: 0.35 });
    s.tone(90, { duration: 0.3, type: 'square', endFreq: 40, volume: 0.2 });
  },
  dog: (s) => {
    s.tone(520, { duration: 0.09, type: 'square', endFreq: 300, volume: 0.25 });
    s.tone(520, { at: 0.14, duration: 0.09, type: 'square', endFreq: 300, volume: 0.25 });
  },
  shield: (s) => {
    s.tone(1400, { duration: 0.12, type: 'square', endFreq: 900, volume: 0.15 });
    s.tone(700, { at: 0.04, duration: 0.25, type: 'triangle', volume: 0.3 });
  },
  // Ворона: «кар» — два хриплых скользящих тона
  caw: (s) => {
    s.tone(720, { duration: 0.16, type: 'sawtooth', endFreq: 420, volume: 0.18 });
    s.tone(680, { at: 0.2, duration: 0.18, type: 'sawtooth', endFreq: 380, volume: 0.18 });
  },
  land: (s) => s.tone(140, { duration: 0.12, type: 'triangle', endFreq: 70, volume: 0.35 }),
  bossHit: (s) => {
    s.tone(300, { duration: 0.1, type: 'square', endFreq: 900, volume: 0.2 });
    s.tone(900, { at: 0.08, duration: 0.2, type: 'sawtooth', endFreq: 500, volume: 0.15 });
  },
  bossDown: (s) => {
    [523, 784, 1047].forEach((f, i) => s.tone(f, { at: i * 0.09, duration: 0.2, type: 'square', volume: 0.15 }));
  },
  pigeon: (s) => {
    s.tone(400, { duration: 0.12, type: 'sine', endFreq: 300, volume: 0.35 });
    s.tone(360, { at: 0.15, duration: 0.2, type: 'sine', endFreq: 260, volume: 0.3 });
  },
  fall: (s) => s.tone(700, { duration: 0.6, type: 'sine', endFreq: 80, volume: 0.4 }),
  stamps: (s) => {
    s.tone(440, { duration: 0.2, type: 'triangle', volume: 0.35 });
    s.tone(330, { at: 0.2, duration: 0.35, type: 'triangle', volume: 0.35 });
  },
  win: (s) => {
    [523, 659, 784, 1047].forEach((f, i) => s.tone(f, { at: i * 0.11, duration: 0.25, type: 'triangle', volume: 0.35 }));
  },
};
