// Retro sound effects and background music synthesised with Web Audio, so there are no audio files to ship.
let ac = null, musicOut = null, noise = null;
const muted = { sfx: load('mute'), music: load('muteMusic'), vibe: load('muteVibe') };
const STORE = { sfx: 'mute', music: 'muteMusic', vibe: 'muteVibe' };
export const vibrate = pattern => { if (!muted.vibe) navigator.vibrate?.(pattern); };

function load(key) { try { return localStorage.getItem(key) === '1'; } catch { return false; } }
export const isMuted = kind => muted[kind];
export const hush = on => { if (ac) on ? ac.suspend() : ac.resume(); }; // silent while an ad plays
export function toggleMute(kind) {
  muted[kind] = !muted[kind];
  try { localStorage.setItem(STORE[kind], muted[kind] ? '1' : '0'); } catch {}
  if (musicOut) musicOut.gain.value = muted.music ? 0 : 1;
  return muted[kind];
}

function audio() {
  ac ??= new (window.AudioContext || window.webkitAudioContext)(); // first made on a tap/key, as browsers require
  if (ac.state === 'suspended') ac.resume();
  return ac;
}

// Silence the app in the background (also stops the music scheduler running ahead).
document.addEventListener('visibilitychange', () => { if (ac) document.hidden ? ac.suspend() : ac.resume(); });

// One oscillator sweeping f0 → f1 from time t, with a fading envelope.
function voice(type, f0, f1, t, dur, vol, out) {
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(out);
  o.start(t); o.stop(t + dur);
}

function tone(type, f0, f1, dur, vol, delay = 0) {
  if (muted.sfx) return;
  try { audio(); voice(type, f0, f1, ac.currentTime + delay, dur, vol, ac.destination); } catch {} // no audio: play on silently
}

const SCALE = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16]; // one major-scale step higher per combo

export const sfx = {
  rotate: () => tone('square', 620, 880, 0.05, 0.06),
  land: () => tone('triangle', 170, 45, 0.16, 0.35),
  clear: combo => {
    const f = 392 * 2 ** (SCALE[Math.min(Math.max(combo, 1), 10) - 1] / 12);
    [0, 4, 7, 12].forEach((n, i) => tone('square', f * 2 ** (n / 12), f * 2 ** (n / 12) * 1.01, 0.09, 0.08, i * 0.06));
  },
  count: () => tone('square', 440, 440, 0.12, 0.09), // each second of the 3-2-1 before a game
  start: () => { tone('square', 523, 523, 0.08, 0.08); tone('square', 784, 784, 0.14, 0.08, 0.09); },
  gameOver: () => { tone('sawtooth', 440, 220, 0.35, 0.1); tone('sawtooth', 300, 55, 0.8, 0.1, 0.35); },
  boom: () => {
    if (muted.sfx) return;
    try {
      audio();
      const t = ac.currentTime;
      hiss(t, 0.9, 0.6, ac.destination, 2500);
      voice('sine', 150, 28, t, 0.7, 0.7, ac.destination);
      voice('square', 90, 35, t, 0.3, 0.12, ac.destination);
    } catch {}
  },
  shing: () => { tone('sawtooth', 2400, 500, 0.25, 0.06); tone('square', 1800, 1700, 0.12, 0.04, 0.02); },
  whirr: () => { for (let i = 0; i < 6; i++) tone('sawtooth', 160 + i * 60, 240 + i * 60, 0.12, 0.05, i * 0.1); },
  rumble: () => {
    if (muted.sfx) return;
    try {
      audio();
      const t = ac.currentTime;
      hiss(t, 1.6, 0.45, ac.destination, 500);
      voice('sine', 62, 30, t, 1.6, 0.6, ac.destination);
    } catch {}
  },
  warn: () => { tone('square', 330, 330, 0.12, 0.08); tone('square', 262, 262, 0.2, 0.08, 0.14); },
  crash: () => { sfx.boom(); sfx.rumble(); }, // intro: the title hits the floor
  prize: () => [72, 76, 79, 84, 88].forEach((n, k) => tone('square', midi(n), midi(n), 0.12, 0.07, k * 0.07)), // reward or achievement
  whoosh: () => { // intro → menu: a rising sweep, then a sparkle
    tone('triangle', 160, 1500, 0.35, 0.2);
    [84, 88, 91, 96].forEach((n, k) => tone('square', midi(n), midi(n), 0.12, 0.05, 0.3 + k * 0.05));
  },
};

// --- Music: looping songs in eighth-note steps (SONGS below). The game song's notes:
const midi = n => 440 * 2 ** ((n - 69) / 12);
const ARP = [57, 60, 64, 60, 57, 60, 64, 67, 53, 57, 60, 57, 53, 57, 60, 64,
             55, 59, 62, 59, 55, 59, 62, 65, 52, 56, 59, 64, 62, 59, 56, 59];
const BASS = [45, 45, 57, 45, 41, 41, 53, 41, 43, 43, 55, 43, 40, 40, 52, 40]; // one per quarter
const LEAD = [76, 0, 0, 74, 72, 0, 69, 0, 72, 0, 0, 69, 65, 0, 69, 0,         // 0 = rest
              71, 0, 0, 74, 79, 0, 77, 74, 76, 0, 0, 0, 75, 0, 71, 0];
let timer = 0, stepN = 0, nextT = 0, tempo = 1, song = null;

// White noise from t, fading out over dur (hi-hats and the chocolate blast).
function hiss(t, dur, vol, out, lowpass) {
  noise ??= (() => {
    const b = ac.createBuffer(1, ac.sampleRate, ac.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  })();
  const s = ac.createBufferSource(), g = ac.createGain();
  s.buffer = noise;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  if (lowpass) {
    const f = ac.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.setValueAtTime(lowpass, t); f.frequency.exponentialRampToValueAtTime(100, t + dur);
    s.connect(f).connect(g);
  } else s.connect(g);
  g.connect(out);
  s.start(t); s.stop(t + dur);
}
const hat = t => hiss(t, 0.04, 0.03, musicOut);
const note = (type, n, t, dur, vol) => voice(type, midi(n), midi(n), t, dur, vol, musicOut);
const kick = t => voice('sine', 150, 40, t, 0.12, 0.25, musicOut);

// Intro: bright C major (C Am F G), bouncing octave bass, arpeggio, a tune and a beat.
const IN_ROOT = [48, 45, 41, 43], IN_CHORD = [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]];
const IN_LEAD = [72, 0, 79, 0, 76, 79, 84, 0, 81, 0, 79, 76, 72, 0, 69, 0,
                 77, 0, 81, 0, 84, 81, 77, 81, 79, 0, 83, 0, 86, 0, 83, 79];
// Drama: D minor (Dm Bb Gm A), driving saw bass, long falling lead, a timpani hit on each bar.
const DR_ROOT = [50, 46, 43, 45], DR_LEAD = [74, 72, 70, 69, 67, 70, 69, 73]; // one per half bar
// Menu: calm F major (Fmaj7 Am7 Bbmaj7 C), soft arpeggio up and down; a gentle tune joins on the repeat.
const MN_ROOT = [41, 45, 46, 48], MN_CHORD = [[65, 69, 72, 76], [64, 67, 69, 72], [62, 65, 69, 70], [64, 67, 72, 76]];
const MN_LEAD = [81, 0, 0, 79, 77, 0, 0, 0, 76, 0, 0, 0, 72, 0, 76, 0,
                 77, 0, 0, 74, 70, 0, 0, 0, 79, 0, 76, 0, 72, 0, 0, 0];
const UPDOWN = [0, 1, 2, 3, 2, 1, 0, 1];

// Each song: tempo, and what to play on eighth note i (from t, one eighth lasting len seconds).
const SONGS = {
  game: { bpm: 128, play(i, t, len) { // an 8-bar loop in A minor (Am F G E); the lead joins on the repeat
    const j = i % 32;
    note('square', ARP[j], t, len * 0.8, 0.025);
    if (j % 2 === 0) note('triangle', BASS[j >> 1], t, len * 1.9, 0.12); else hat(t);
    if (i % 64 >= 32 && LEAD[j]) note('square', LEAD[j], t, len * 1.8, 0.045);
  } },
  intro: { bpm: 150, play(i, t, len) {
    const j = i % 32, bar = j >> 3;
    note('triangle', IN_ROOT[bar] + (j % 2) * 12, t, len * 0.9, 0.12);
    note('square', IN_CHORD[bar][[0, 1, 2, 1][j % 4]] + 12, t, len * 0.5, 0.018);
    if (IN_LEAD[j]) note('square', IN_LEAD[j], t, len * 1.6, 0.045);
    if (j % 4 === 0) kick(t); else if (j % 4 === 2) hiss(t, 0.08, 0.06, musicOut, 5000); else hat(t);
  } },
  drama: { bpm: 180, play(i, t, len) {
    const j = i % 32, bar = j >> 3;
    note('sawtooth', DR_ROOT[bar] - (j % 8 === 7 ? 0 : 12), t, len * 0.7, j % 2 ? 0.04 : 0.06);
    if (j % 4 === 0) note('square', DR_LEAD[j >> 2], t, len * 3.8, 0.05);
    if (j % 8 === 0) { voice('sine', 110, 45, t, 0.45, 0.35, musicOut); hiss(t, 0.3, 0.08, musicOut, 900); }
    else if (j % 2) hat(t);
  } },
  menu: { bpm: 96, play(i, t, len) {
    const j = i % 32, bar = j >> 3;
    if (j % 2 === 0) note('triangle', MN_ROOT[bar] + [0, 7, 12, 7][(j >> 1) % 4], t, len * 1.9, 0.1);
    note('square', MN_CHORD[bar][UPDOWN[j % 8]], t, len * 0.7, 0.016);
    if (i % 64 >= 32 && MN_LEAD[j]) note('triangle', MN_LEAD[j], t, len * 2.5, 0.09);
    if (j % 4 === 2) hat(t);
  } },
};

function schedule() {
  while (nextT < ac.currentTime + 0.15) { // schedule a little ahead so timer jitter can't cause gaps
    const len = 30 / (song.bpm * tempo); // one eighth note
    song.play(stepN, nextT, len);
    nextT += len; stepN++;
  }
}

export const music = {
  start(name = 'game') {
    if (timer && song === SONGS[name]) return;
    this.stop();
    try {
      audio();
      musicOut?.disconnect(); // a new output cuts the notes the last song had scheduled ahead
      musicOut = ac.createGain();
      musicOut.connect(ac.destination);
      musicOut.gain.value = muted.music ? 0 : 1;
      song = SONGS[name]; tempo = 1; stepN = 0; nextT = ac.currentTime + 0.05;
      timer = setInterval(schedule, 25);
    } catch {}
  },
  stop() { clearInterval(timer); timer = 0; },
  speed(f) { tempo = f; }, // 1 = normal; bigger bonus → faster
};
