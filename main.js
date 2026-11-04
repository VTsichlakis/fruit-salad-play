import { W, H, HOLD_ROWS, PALETTE, FRUITS, RAINBOW, rot, step, findClear, collides, stamp, makeCombo,
  blast, cut, blend, jitter, stoneFloor, RAINBOW_EVERY, rainbowsEarned, TIERS, tier, fruitsIn, JOKER,
  dayNumber, nextStreak, weekNumber, daysLeft } from './logic.js';
import { sfx, music, isMuted, toggleMute, vibrate, hush } from './sfx.js';
import { planReminder } from './remind.js';
import { adReady, adShowing, needsAdPrivacy, initAds, showAd, adPrivacyOptions } from './ads.js';
import { intro } from './intro.js';
import { t, setLang, lang, LANGS, pickLang, flagPx, FLAG_SIZE } from './lang.js';

const $ = id => document.getElementById(id);
const cv = $('well'), ctx = cv.getContext('2d'), nctx = $('next').getContext('2d'), multEl = $('mult');
const PW = W, PH = H; // canvas size in pixels (1 grain = 1 pixel)
cv.width = PW; cv.height = PH;
const img = ctx.createImageData(PW, PH), buf = img.data;

const BG = [20, 18, 28], LINE = [110, 40, 60], WHITE = [255, 255, 255];
const FALL_SPEED = 82; // grains per second at level 0, Med
const FAST_BONUS = 117; // extra grains/s while ↓ or a down-swipe is held (original: +2 on 1.4 px/frame)
const SAND_RATE = 16;  // sand passes per second at level 0, Med
const DIFF = { lo: 0.69, med: 1.15, hi: 1.61 }; // start speed per difficulty: the original's 0.6/1/1.4, made 15% harder
// Modes, as in the original: Endless speeds up with lines; 3 MIN is a fixed-speed race for score;
// Clear 40 is a race against the clock to clear 40 lines, above a stone floor that grows with difficulty.
const MODES = { endless: 'ENDLESS', time: '3 MIN', clear: 'CLEAR 40' };
const TIME_LIMIT = 180;
const CLEAR_LINES = 40;
const STONE_ROWS = { lo: 0, med: 22, hi: 36 }; // the original's 0/24/40 of 144 rows, scaled to our 131
const LEVEL_LINES = 10; // Endless: lines per level; each level is +10% fall and sand speed, as in the original
const MAX_LEVEL = 8;   // hold time is down to 0.2s here
const COMBO_TIME = 6;  // seconds a bonus lasts after each clear
const SPAWN_Y = 2;     // rows 0-1 hold the countdown bar
const PAD = 0.14;      // share of the screen height kept free under the well for the dragging finger
const PAD_MIN = 64;    // ...but never less than this many css px
const BOARD = 5;       // scores kept per difficulty
const HELPS = { choc: 3, knife: 3, blend: 3, quake: 3 }; // uses of each help per game, offered when you lose
const BLAST_R = 18;    // chocolate blast radius in grains
const KNIFE_H = 5;     // knife cuts this many rows above and below where it's dropped
const BLEND_R = 16;    // blender radius in grains
const QUAKE_TIME = 1.5; // seconds the earthquake shakes
const RAINBOW_CHANCE = 0.05; // per fruit, in a game you spend a rainbow on
const RAINBOW_START = 3;     // rainbows you own at first; unlike the other helps they carry over between games
const RAINBOW_ADS = 3; // rewarded ads for a rainbow fruit, per day
// Weekly Clear 40 challenge: finish under this many minutes on each difficulty; the reward for each.
const CLEAR_WEEK = { lo: 10, med: 9, hi: 8 }, CLEAR_PRIZE = { lo: 'help', med: 'help', hi: 'rainbow' };
// Score achievements per difficulty: the score to reach in one game of that mode (ESCORE Endless, TSCORE 3 MIN).
const SCORE_GOAL = { ESCORE: { lo: 200000, med: 400000, hi: 600000 }, TSCORE: { lo: 30000, med: 40000, hi: 50000 } };
const SCORE_MODE = { ESCORE: 'endless', TSCORE: 'time' };
const count = v => Math.max(0, Math.floor(+v) || 0); // stored numbers: whole and not negative, whatever is in storage
// Achievements besides the weekly challenges, in display order: id: [group, reward, progress → [now, goal]].
// reward: 'help' = a random power-up, 'rainbow' = a rainbow fruit, 'chest' = one of every power-up. Names and how-tos are in lang.js (ach_<id>).
const ACH = {
  combo5: ['COMBO', 'help'], combo10: ['COMBO', 'rainbow'],
  escore_lo: ['ESCORE', 'help'], escore_med: ['ESCORE', 'help'], escore_hi: ['ESCORE', 'rainbow'],
  tscore_lo: ['TSCORE', 'help'], tscore_med: ['TSCORE', 'help'], tscore_hi: ['TSCORE', 'rainbow'],
  lv5: ['ENDLESS', 'help'], lv9: ['ENDLESS', 'rainbow'],
  nohelp100: ['SKILL', 'help'], // new id: the 20-line one was too easy
  salad: ['SKILL', 'help'],
  rbbridge: ['SKILL', 'help'], // new id: the old one could be won without rainbow
  rbmaster: ['SKILL', 'help', () => [stats.rainbowLines, 10]],
  use_choc: ['DEMOLITION', 'help', () => [stats.used.choc, 25]], use_knife: ['DEMOLITION', 'help', () => [stats.used.knife, 25]],
  use_blend: ['DEMOLITION', 'help', () => [stats.used.blend, 25]], use_quake: ['DEMOLITION', 'help', () => [stats.used.quake, 25]],
};

// 13×14 pixel icons: letter → colour, '.' transparent.
const ICONS = {
  choc: { // chocolate bar, half unwrapped
    col: { D: [70, 35, 20], C: [120, 65, 35], L: [170, 105, 60], R: [200, 40, 50], r: [140, 25, 35], Y: [240, 200, 80] },
    rows: ['.DDDDDDDDDDD.', 'DLLCDLLCDLLCD', 'DLCCDLCCDLCCD', 'DCCCDCCCDCCCD', 'DDDDDDDDDDDDD', 'DLLCDLLCDLLCD',
      'DLCCDLCCDLCCD', 'DCCCDCCCDCCCD', 'rRrRRrRRrRRrr', 'rRYYYYYYYYYRr', 'rRRRRRRRRRRRr', 'rRRRRRRRRRRRr',
      'rRRRRRRRRRRRr', 'rrrrrrrrrrrrr'] },
  knife: { // blade up-right, wooden handle down-left
    col: { S: [210, 215, 225], s: [130, 135, 150], W: [255, 255, 255], B: [120, 70, 35], b: [70, 40, 20], G: [230, 190, 70] },
    rows: ['..........sS.', '.........sWS.', '........sWSs.', '.......sWSs..', '......sWSs...', '.....sWSs....',
      '....sWSs.....', '...GGSs......', '..GbBG.......', '..bBBb.......', '.bBBb........', '.bBb.........',
      'bBb..........', 'bb...........'] },
  blend: { // glass jug of orange juice on a red base
    col: { K: [40, 40, 50], g: [150, 195, 220], G: [220, 240, 250], J: [245, 140, 20], j: [255, 190, 80], S: [190, 195, 205], R: [200, 40, 50], r: [140, 25, 35] },
    rows: ['...KKKKKKK...', '...gGggggg...', '...gGJjJJg...', '...gGJJjJgg..', '...gGJJJJg.g.', '...gGjJJJg.g.',
      '...gGJJjJgg..', '...gGJJJJg...', '....gJJJg....', '....gSSSg....', '...rRRRRRr...', '..rRRSSSRRr..',
      '..rRRRRRRRr..', '..rrrrrrrrr..'] },
  quake: { // cracked ground with shake lines
    col: { L: [180, 170, 200], D: [110, 70, 40], d: [80, 50, 30], Y: [250, 220, 90] },
    rows: ['L.L.......L.L', '.L.L.....L.L.', '.............', 'DDDDDYDDDDDDD', 'DdDDYYdDDdDDD', 'DDDDYdDDDDDdD',
      'DdDDDYYDDDDDD', 'DDDDDDYdDdDDD', 'DdDdDYYDDDDdD', 'DDDDDYDDDDDDD', 'DDdDYYDDdDDDD', 'DDDDYDDDDDDdD',
      'DdDDDYDDDDDDD', 'ddddddddddddd'] },
  chest: { // the weekly chest: wood with gold bands and a lock
    col: { K: [50, 30, 20], B: [120, 70, 35], b: [160, 100, 50], G: [230, 190, 70], g: [170, 130, 40], Y: [255, 240, 150] },
    rows: ['.............', '..KKKKKKKKK..', '.KBBBBBBBBBK.', 'KBbbbbbbbbbBK', 'KBbbbbbbbbbBK', 'KGGGGGGGGGGGK',
      'KGGGGgYgGGGGK', 'KBbbbgYgbbbBK', 'KBbbbgggbbbBK', 'KBbbbbbbbbbBK', 'KGbbbbbbbbbGK', 'KBbbbbbbbbbBK',
      'KGGGGGGGGGGGK', '.KKKKKKKKKKK.'] },
  // settings buttons
  joystick: { // arcade stick: red ball on a stick, base with two buttons
    col: { K: [25, 20, 35], R: [225, 45, 55], r: [150, 20, 30], W: [255, 160, 160], s: [160, 160, 175], S: [110, 110, 125],
      B: [70, 62, 100], b: [110, 100, 150], Y: [250, 210, 60], G: [80, 195, 80] },
    rows: ['....KKKKK....', '...KRWRRRK...', '...KRWRRRK...', '...KRRRRrK...', '....KrrrK....', '.....KsK.....',
      '.....KsK.....', '.....KsK.....', '.....KsK.....', '.KKKKKSKKKKK.', 'KbbbbbbbbbbbK', 'KBYBBBBBBGBBK',
      'KBBBBBBBBBBBK', '.KKKKKKKKKKK.'] },
  trophy: { // gold cup with handles on a wooden base
    col: { K: [90, 60, 15], G: [245, 200, 50], g: [190, 140, 20], Y: [255, 240, 150], B: [130, 80, 40] },
    rows: ['..KKKKKKKKK..', 'KKKYYGGGGgKKK', 'K.KYGGGGGgK.K', 'K.KYGGGGGgK.K', '.KKYGGGGGgKK.', '...KGGGGgK...',
      '....KGGgK....', '.....KgK.....', '.....KgK.....', '....KGGgK....', '...KKKKKKK...', '...KBBBBBK...',
      '...KBBBBBK...', '...KKKKKKK...'] },
  heart: { // credits
    col: { K: [110, 25, 50], R: [235, 65, 95], r: [175, 35, 65], W: [255, 195, 205] },
    rows: ['.............', '..KKK...KKK..', '.KRWRK.KRRRK.', 'KRWRRRKRRRRrK', 'KRRRRRRRRRRrK', 'KRRRRRRRRRRrK',
      '.KRRRRRRRRrK.', '..KRRRRRRrK..', '...KRRRRrK...', '....KRRrK....', '.....KrK.....', '......K......',
      '.............', '.............'] },
  lock: { // ad privacy
    col: { S: [180, 185, 200], K: [150, 100, 20], Y: [250, 205, 60], g: [200, 150, 30] },
    rows: ['....SSSSS....', '...S.....S...', '..S.......S..', '..S.......S..', '..S.......S..', 'KKKKKKKKKKKKK',
      'KYYYYYYYYYYgK', 'KYYYYKKYYYYgK', 'KYYYYKKYYYYgK', 'KYYYYYKYYYYgK', 'KYYYYYKYYYYgK', 'KYYYYYYYYYYgK',
      'KgggggggggggK', '.KKKKKKKKKKK.'] },
  trash: { // reset scores
    col: { K: [80, 80, 95], G: [185, 190, 205], g: [135, 140, 155], W: [240, 245, 255] },
    rows: ['.....KKK.....', '....K...K....', 'KKKKKKKKKKKKK', 'KWGGGGGGGGGgK', 'KKKKKKKKKKKKK', '.KWGgGgGgGgK.',
      '.KWGgGgGgGgK.', '.KWGgGgGgGgK.', '.KWGgGgGgGgK.', '.KWGgGgGgGgK.', '.KWGgGgGgGgK.', '.KWGgGgGgGgK.',
      '.KWGGGGGGGgK.', '..KKKKKKKKK..'] },
  music: { // two pink eighth notes
    col: { N: [255, 100, 190], n: [190, 50, 140], W: [255, 205, 235] },
    rows: ['.............', '....nNNNNNNN.', '....NNNNNNNN.', '....N......N.', '....N......N.', '....N......N.',
      '....N......N.', '....N......N.', '..NNN....NNN.', '.NWNNN..NWNNN', '.NNNNn..NNNNn', '..nnn....nnn.',
      '.............', '.............'] },
  speaker: { // sound effects: yellow speaker, blue sound waves
    col: { K: [205, 140, 30], S: [250, 210, 60], C: [90, 210, 255] },
    rows: ['.............', '.............', '......K...C..', '.....KK....C.', '....KSK..C..C', 'KKKKSSK...C.C',
      'KSSSSSK...C.C', 'KSSSSSK...C.C', 'KKKKSSK...C.C', '....KSK..C..C', '.....KK....C.', '......K...C..',
      '.............', '.............'] },
  vibe: { // vibration: a phone with orange shake lines
    col: { K: [150, 140, 190], p: [90, 200, 255], O: [255, 150, 40], W: [255, 255, 255] },
    rows: ['.............', '...KKKKKKK...', '...KpppppK...', 'O..KpppppK..O', '.O.KpppppK.O.', 'O..KpppppK..O',
      '.O.KpppppK.O.', 'O..KpppppK..O', '.O.KpppppK.O.', '...KpppppK...', '...KKKKKKK...', '...KKKWKKK...',
      '...KKKKKKK...', '.............'] },
};

// Fire on the fruit while the bonus is high: small from x3, medium from x5, big from x7.
const FIRE = [null,
  { n: 1, life: 0.3, up: 25, size: 1 },
  { n: 3, life: 0.45, up: 35, size: 1 },
  { n: 6, life: 0.6, up: 45, size: 2 }];
const FLAME = [[255, 235, 140], [255, 140, 30], [200, 40, 20]]; // hot → cool as a flame ages
const FIRE_CSS = ['#f5cd28', '#ffb347', '#ff7a2a', '#ff3b1f'];

let grid = new Uint8Array(W * H), piece = null, next = null, score = 0, lines = 0, boards = loadBoards();
let state = 'intro', overAt = 0, holdLeft = 0, holdTime = 3, fallAcc = 0, sandAcc = 0, diff = loadDiff();
let flash = null, flashMask = null, flashT = 0, frame = 0, g0 = null, combo = makeCombo(COMBO_TIME);
let touchFast = false, shake = 0, quake = 0, shown = '', scale = 1; // scale: css px per grain, set by fit()
let fire = [], extras = loadExtras(), helps = fullHelps(), carry = null; // carry: the help waiting for a tap, { tool, at: [gx, gy] | null, mid }
let keepPiece = false; // a help used mid-game (from the 💪 window): the falling fruit stays after the sand settles
let stats = loadStats(), usedHelp = false, gameFruits = new Set(); // per game: a help used, fruits cleared
checkWeek();
let quakeT = 0, rainbowOn = false, rainbows = loadRainbows(), mode = loadMode(), playT = 0, infoShown = '';
const carryEl = $('carry');
const MENU_TITLE = $('title').textContent; // game over rewrites it
const App = window.Capacitor?.Plugins?.App; // only inside the Android app (@capacitor/app)
let pausedFrom = null;
const keys = { left: 0, right: 0, down: 0 };
const NEXT = 36; // next-fruit preview canvas size, fits the banana

function loadDiff() { try { return DIFF[localStorage.getItem('diff')] ? localStorage.getItem('diff') : 'med'; } catch { return 'med'; } }
function saveDiff() { try { localStorage.setItem('diff', diff); } catch {} }
function loadMode() { try { return MODES[localStorage.getItem('mode')] ? localStorage.getItem('mode') : 'endless'; } catch { return 'endless'; } }
function saveMode() { try { localStorage.setItem('mode', mode); } catch {} }
function loadRainbows() {
  try { const v = localStorage.getItem('rainbows'); return v === null ? RAINBOW_START : Math.max(0, Math.floor(+v) || 0); }
  catch { return RAINBOW_START; }
}
function saveRainbows() { try { localStorage.setItem('rainbows', rainbows); } catch {} }
// extras: helps from daily gifts, on top of the 3 free per game; they stay until used (the free ones go first)
function loadExtras() {
  let e = null;
  try { e = JSON.parse(localStorage.getItem('extras')); } catch {}
  return Object.fromEntries(Object.keys(HELPS).map(t => [t, count(e?.[t])]));
}
function saveExtras() { try { localStorage.setItem('extras', JSON.stringify(extras)); } catch {} }
function fullHelps() { return Object.fromEntries(Object.keys(HELPS).map(t => [t, HELPS[t] + extras[t]])); }
// stats for the achievements: lines in all games and per fruit class (index 1-4), lines with rainbow sand,
// helps used, games played, days in a row (and the day of the last game), and which ACH are got
function loadStats() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem('stats')); } catch {}
  return { lines: count(s?.lines), fruit: [0, 1, 2, 3, 4].map(c => count(s?.fruit?.[c])), rainbowLines: count(s?.rainbowLines),
    used: Object.fromEntries(Object.keys(HELPS).map(t => [t, count(s?.used?.[t])])),
    games: count(s?.games), streak: count(s?.streak), day: count(s?.day), week: count(s?.week), chest: s?.chest ? 1 : 0,
    clearBest: Object.fromEntries(Object.keys(CLEAR_WEEK).map(d => [d, count(s?.clearBest?.[d])])), // this week's best Clear 40, ms
    clearChest: s?.clearChest ? 1 : 0,
    // chests given for every 7 days in a row / every 100 games (before they repeated, each could be won once)
    gamesChests: count(s?.gamesChests) || (s?.got?.games100 ? 1 : 0), // 100-game milestones already rewarded
    got: Object.fromEntries(Object.keys(ACH).filter(id => s?.got?.[id]).map(id => [id, 1])) };
}
function saveStats() { try { localStorage.setItem('stats', JSON.stringify(stats)); } catch {} }
// The fruit stars are a weekly challenge: a new week (from Monday) starts them, and the chest, again.
function checkWeek() {
  const w = weekNumber(new Date());
  if (stats.week === w) return;
  stats.week = w; stats.fruit = [0, 0, 0, 0, 0]; stats.chest = 0; stats.clearBest = { lo: 0, med: 0, hi: 0 }; stats.clearChest = 0; saveStats();
}
// boards[mode][difficulty]: top scores, or for Clear 40 the fastest times in ms
function loadBoards() {
  const empty = () => ({ lo: [], med: [], hi: [] }), ok = b => b && Object.keys(DIFF).every(d => Array.isArray(b[d]));
  try {
    const b = JSON.parse(localStorage.getItem('boards2'));
    if (b && Object.keys(MODES).every(m => ok(b[m]))) return b;
  } catch {}
  let endless = empty();
  try { const old = JSON.parse(localStorage.getItem('boards')); if (ok(old)) endless = old; } catch {} // from before modes: all Endless
  return { endless, time: empty(), clear: empty() };
}
function saveBoards() { try { localStorage.setItem('boards2', JSON.stringify(boards)); } catch {} }
const clock = (s, tenths) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}${tenths ? '.' + Math.floor(s * 10) % 10 : ''}`;
const fmt = (m, v) => !Number.isFinite(v) ? '-' : m === 'clear' ? clock(v / 1000, true) : v; // stored values: numbers only
const bestOf = (m, d) => boards[m][d].length ? fmt(m, Number(boards[m][d][0])) : m === 'clear' ? '-' : 0;

// A random fruit, already turned the way it will fall (0-3 quarter turns), so the preview shows it as it comes.
function rndFruit() {
  if (tut && tut.step !== 'done') return FRUITS[0].sprite; // the tutorial's bananas, lying flat
  let s = rainbowOn && Math.random() < RAINBOW_CHANCE ? RAINBOW.sprite : FRUITS[Math.floor(Math.random() * FRUITS.length)].sprite;
  for (let r = Math.floor(Math.random() * 4); r > 0; r--) s = rot(s);
  return s;
}
const clampX = (x, s) => Math.max(0, Math.min(W - s.w, x));
const level = () => mode === 'endless' ? Math.min(MAX_LEVEL, Math.floor(lines / LEVEL_LINES)) : 0; // other modes keep one speed
const speed = () => DIFF[diff] * (1 + 0.1 * level());
const fireLevel = () => combo.mult >= 7 ? 3 : combo.mult >= 5 ? 2 : combo.mult >= 3 ? 1 : 0;


// --- Tutorial: the first time the app opens (and from How to play), a short guided game on Easy. A floor of banana
// sand with a gap waits at the bottom, the fruits are bananas, and each step waits for the player to do what it says.
// Nothing in it counts: no stats, scores or achievements.
const TUT_GAP = [38, 62]; // columns of the gap in the tutorial floor
const TUT_TEXT = { move: 'tutMove', rotate: 'tutRotate', drop: 'tutDrop', cleared: 'tutCleared', power: 'tutPower', lose: 'tutLose', done: 'tutDone' };
const ARROW = ['..###..', '..###..', '..###..', '#######', '.#####.', '..###..', '...#...'];
let tut = null; // while it runs: { step, x0, landed, freeze, saved: { mode, diff } }
const tutSeen = () => { try { return localStorage.getItem('tutDone') === '1'; } catch { return false; } };
function startTutorial() {
  $('settings').hidden = true; $('overlay').hidden = true;
  tut = { step: 'move', saved: { mode, diff } };
  mode = 'endless'; diff = 'lo'; rainbowOn = false;
  newGame(true);
  for (let y = H - 4; y < H; y++) for (let x = 0; x < W; x++)
    if (x < TUT_GAP[0] || x >= TUT_GAP[1]) grid[y * W + x] = 4 + 1 + ((x * 7 + y * 3) % 5 === 0); // banana sand, a few light grains
  tut.x0 = piece.x;
  sfx.start(); music.start();
  tutShow();
}
function tutStep(step) {
  tut.step = step; tut.freeze = step === 'cleared' || step === 'lose' || step === 'done'; // reading time: the game waits
  if (step === 'cleared') sfx.prize();
  if (step === 'power') tutFill();
  tutShow();
}
function tutShow(key = TUT_TEXT[tut.step]) {
  $('tutText').textContent = t(key);
  $('tutNext').hidden = !tut.freeze; $('tutNext').textContent = t(tut.step === 'done' ? 'tutPlay' : 'tutNext');
  $('tutSkip').hidden = tut.step === 'done';
  $('tut').style.top = `${cv.getBoundingClientRect().top + (HOLD_ROWS + 6) * scale}px`; // just under the waiting fruit
  $('tut').hidden = false;
}
// For the power-up step: the lower half of the well full of sand, in stripes of 4 fruits 10 grains wide,
// so no fruit's sand reaches from wall to wall and nothing clears by itself.
function tutFill() {
  for (let y = H >> 1; y < H; y++) for (let x = 0; x < W; x++)
    if (!grid[y * W + x]) grid[y * W + x] = (1 + Math.floor(x / 10) % 4) * 4 + ((x * 7 + y * 3) % 5 === 0 ? 2 : 1);
}
// Each frame: the player moved the fruit far enough; or a fruit landed and no clear came of it.
function tutTick() {
  if (tut.step === 'move' && Math.abs(piece.x - tut.x0) >= 10) tutStep('rotate');
  if (tut.step === 'drop' && tut.landed && playT - tut.landed > 3 && !flash) { tut.landed = 0; tutShow('tutAgain'); }
}
function endTutorial() {
  if (!tut) return;
  ({ mode, diff } = tut.saved); tut = null; $('tut').hidden = true;
  try { localStorage.setItem('tutDone', '1'); } catch {}
}

function newGame(tutorial = false) {
  grid = new Uint8Array(W * H); score = 0; lines = 0; flash = null; combo = makeCombo(COMBO_TIME);
  sandAcc = 0; fire = []; helps = fullHelps(); carry = null; keepPiece = false; carryEl.hidden = true; $('rescue').hidden = true; playT = 0;
  usedHelp = false; gameFruits = new Set();
  if (!tutorial) countGame();
  if (mode === 'clear') stoneFloor(grid, STONE_ROWS[diff]);
  next = rndFruit(); spawn(); state = 'play'; $('overlay').hidden = true; hud();
}

// A game started: games played, days in a row, and the chests that come with them.
function countGame() {
  const today = dayNumber(new Date());
  const was = stats.streak;
  stats.streak = nextStreak(stats.streak, stats.day, today); stats.day = today; stats.games++; saveStats();
  // Milestones whose chests grow: 7 days in a row give 1 chest, 14 give 2, 21 give 3…; 100 games give 1, 200 give 2…
  if (stats.streak !== was && stats.streak % 7 === 0) toast(t('tAchChest', t('daysName', stats.streak), giveChest(stats.streak / 7)));
  while (Math.floor(stats.games / 100) > stats.gamesChests) {
    const k = ++stats.gamesChests; saveStats();
    toast(t('tAchChest', t('gamesName', k * 100), giveChest(k)));
  }
  remind(false);
}

function spawn() {
  const s = next;
  next = rndFruit();
  piece = { s, x: (W - s.w) >> 1, y: SPAWN_Y, falling: false };
  holdTime = 1 - 0.1 * level(); // 1s → 0.2s at MAX_LEVEL
  holdLeft = holdTime; fallAcc = 0; g0 = null; touchFast = false; keys.down = 0; // a new fruit needs a new ↓
  drawNext();
}

function rotate() {
  const s = rot(piece.s), x = clampX(piece.x + ((piece.s.w - s.w) >> 1), s);
  if (collides(grid, s, x, piece.y)) return; // only matters while falling next to sand
  piece.x = x; piece.s = s;
  sfx.rotate();
  if (tut?.step === 'rotate') tutStep('drop');
}

// Step sideways towards tx, stopping at sand (matters once the fruit is falling between piles).
function slideTo(tx) {
  while (piece.x !== tx) {
    const nx = piece.x + Math.sign(tx - piece.x);
    if (collides(grid, piece.s, nx, piece.y)) break;
    piece.x = nx;
  }
}

const aboveLine = () => grid.subarray(0, HOLD_ROWS * W).some(v => v);

// Sand is over the line: offer the helps if any are left, else it's over.
function lose() {
  if (tut) return toMenu(); // the tutorial's well never fills, but just in case
  keepPiece = false; // this fruit has landed: a fresh one comes after the rescue
  if (!Object.values(helps).some(n => n > 0) && !adReady()) return gameOver('lost'); // none left: an ad can still give one
  state = 'rescue'; keys.left = keys.right = keys.down = 0; g0 = null; touchFast = false;
  $('rescue').hidden = false; hud();
  sfx.warn();
}

function pick(e) { // a tap on a help in the "you lost" prompt: the next tap on the sand uses it
  const tool = e.currentTarget.dataset.tool;
  if (state !== 'rescue') return;
  if (!helps[tool]) return adHelp(tool);
  if (tool === 'quake') return startQuake(); // no target: just shake
  $('rescue').hidden = true;
  arm(tool, false);
}
// A help waits for a tap on the sand (pointerdown aims, pointerup uses it); off the well it goes back.
function arm(tool, mid) {
  carry = { tool, at: null, mid };
  drawIcon(carryEl, tool);
  toast(t('aimHint'), false);
}

// From the 💪 window during play: the game waits ('aim') until a tap on the sand uses it; the quake goes at once.
function useMidGame(tool) {
  closeSettings();
  if (state !== 'play' || !helps[tool]) return;
  keepPiece = true;
  if (tool === 'quake') return startQuake();
  state = 'aim'; keys.left = keys.right = keys.down = 0; g0 = null; touchFast = false;
  arm(tool, true);
}

// The free helps go first; once the count left is below the gifted extras, those are being used up.
function spend(tool) {
  if (tut) { if (tut.step === 'power') tutStep('lose'); return; } // the tutorial's are free: nothing is used up or counted
  helps[tool]--;
  if (extras[tool] > helps[tool]) { extras[tool] = helps[tool]; saveExtras(); }
  usedHelp = true; stats.used[tool]++; saveStats();
  if (stats.used[tool] >= 25) unlock('use_' + tool);
}

function startQuake() {
  spend('quake'); $('rescue').hidden = true;
  state = 'quake'; quakeT = QUAKE_TIME; hud();
  sfx.rumble(); vibrate([250, 80, 250, 80, 400]);
}

// Earthquake: sand gets nudged sideways and slides down for a while, then settles as after any help.
function quakeTick(dt) {
  updateFire(dt, false);
  jitter(grid); step(grid); step(grid);
  quake = Math.max(quake, 12);
  if ((quakeT -= dt) <= 0) state = 'settle';
}

function burst(x, y, n, v0, colour) {
  for (let k = 0; k < n; k++) {
    const a = Math.random() * Math.PI * 2, v = v0 * (0.3 + Math.random()), life = 0.4 + Math.random() * 0.6;
    fire.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: life, life, size: Math.random() < 0.3 ? 2 : 1, c: colour() });
  }
}

function moveCarry(e) {
  carryEl.hidden = false;
  carryEl.style.left = e.clientX + 'px'; carryEl.style.top = e.clientY + 'px';
  const r = cv.getBoundingClientRect();
  const gx = Math.floor((e.clientX - r.left) / r.width * W), gy = Math.floor((e.clientY - r.top) / r.height * H);
  carry.at = gx >= 0 && gx < W && gy >= 0 && gy < H ? [gx, gy] : null;
}

function dropCarry() {
  const { tool, at, mid } = carry;
  carry = null; carryEl.hidden = true;
  if (!at) { if (mid) { state = 'play'; keepPiece = false; } else $('rescue').hidden = false; return; } // off the well: nothing used
  spend(tool);
  const [x, y] = at;
  if (tool === 'choc') {
    blast(grid, x, y, BLAST_R);
    burst(x, y, 160, 60, () => Math.random() < 0.3 ? ICONS.choc.col[Math.random() < 0.5 ? 'C' : 'L'] : null); // flames and crumbs
    sfx.boom(); quake = 24; vibrate(350);
  } else if (tool === 'knife') {
    cut(grid, y - KNIFE_H, y + KNIFE_H);
    for (let k = 0; k < 120; k++) { // sparks along the cut
      const life = 0.3 + Math.random() * 0.4;
      fire.push({ x: Math.random() * W, y: y + (Math.random() * 2 - 1) * KNIFE_H, vx: (Math.random() - 0.5) * 40,
        vy: -10 - Math.random() * 30, t: life, life, size: 1, c: Math.random() < 0.5 ? WHITE : ICONS.knife.col.S });
    }
    sfx.shing(); quake = 8; vibrate(120);
  } else { // blender
    const c = blend(grid, x, y, BLEND_R);
    burst(x, y, 90, 30, () => c ? PALETTE[c * 4 + 2] : WHITE);
    sfx.whirr(); vibrate([60, 40, 60]);
  }
  state = 'settle'; hud(); // sand falls into the gap before play goes on
}

// After a help only the sand moves, fast, until it stops; then a fresh fruit, or ask again if still over the line.
function settle(dt) {
  updateFire(dt, false);
  let moved = 0;
  for (let k = 0; k < 3; k++) moved += step(grid);
  if (moved) return;
  if (aboveLine()) return lose();
  state = 'play'; if (!keepPiece) spawn(); keepPiece = false; hud();
}

// reason: 'lost' (sand over the line, no helps left), 'time' (3 MIN ran out) or 'cleared' (Clear 40 done).
// Clear 40 only records finished runs, by time; the other modes record the score either way.
function gameOver(reason) {
  state = 'over'; overAt = performance.now(); $('rescue').hidden = true;
  const b = boards[mode][diff], timed = mode === 'clear', value = timed ? Math.round(playT * 1000) : score;
  let rank = -1;
  if (timed ? reason === 'cleared' : score > 0) {
    b.push(value); b.sort((p, q) => timed ? p - q : q - p); b.length = Math.min(b.length, BOARD);
    rank = b.indexOf(value); saveBoards();
  }
  $('title').textContent = t(reason === 'cleared' ? 'cleared' : reason === 'time' ? 'timesUp' : 'gameOver');
  const what = !timed ? t('scoreIs', score) : reason === 'cleared' ? t('timeIs', clock(playT, true)) : t('linesToGo', CLEAR_LINES - lines);
  $('msg').textContent = rank >= 0 ? `${what} · ${t('rankOn', rank + 1, t(diff))}` : what;
  drawBoard(rank);
  $('overlay').hidden = false; hud();
  music.stop(); music.speed(1); sfx.gameOver();
  checkScore();
  if (reason === 'cleared') weeklyClear(Math.round(playT * 1000));
  remind(true); // a good moment to ask for the notification permission
  setTimeout(() => { if (state === 'over') music.start('menu'); }, 1500); // after the jingle
}

// A line cleared (of these fruit classes, maybe with rainbow sand): a rainbow every RAINBOW_EVERY lines and the
// achievements that come with clearing. Fruit tiers give a help, the last (DIAMOND) a rainbow fruit.
function countLine(fruits, withRainbow, bridged) {
  checkWeek();
  for (const c of fruits) {
    const k = tier(stats.fruit[c]++);
    if (tier(stats.fruit[c]) > k)
      toast(t('tTier', t('fruits')[c - 1], t('medals')[k], TIERS[k], reward(k === TIERS.length - 1 ? 'rainbow' : 'help')));
    gameFruits.add(c);
  }
  if (!stats.chest && stats.fruit.slice(1).every(n => tier(n) === TIERS.length)) { // all 20 stars this week
    stats.chest = 1; toast(t('tChest', giveChest()));
  }
  const was = stats.lines++;
  if (rainbowsEarned(was, stats.lines)) {
    rainbows++; saveRainbows();
    toast(t('tRainbow', stats.lines));
  }
  if (withRainbow) stats.rainbowLines++;
  saveStats();
  if (stats.rainbowLines >= 10) unlock('rbmaster');
  if (gameFruits.size === FRUITS.length) unlock('salad');
  if (bridged) unlock('rbbridge');
  if (combo.mult >= 5) unlock('combo5');
  if (combo.mult >= 10) unlock('combo10');
  if (lines >= 100 && !usedHelp) unlock('nohelp100');
  if (mode === 'endless' && level() >= 4) unlock('lv5'); // level() counts from 0: 4 is LV 5
  if (mode === 'endless' && level() >= MAX_LEVEL) unlock('lv9');
  checkScore();
}

// A finished Clear 40 run of ms: this week's best time, and the reward the first time it beats the limit this week.
// When all three are won in the same week, the Clear 40 chest opens too.
const clearWon = d => stats.clearBest[d] > 0 && stats.clearBest[d] < CLEAR_WEEK[d] * 60000;
function weeklyClear(ms) {
  checkWeek();
  const won = clearWon(diff), best = stats.clearBest[diff];
  if (best && best <= ms) return;
  stats.clearBest[diff] = ms; saveStats();
  if (won || !clearWon(diff)) return; // already won this week, or not under the limit
  toast(t('tAch', `${t('clear')} · ${t(diff)} · ${CLEAR_WEEK[diff]}:00`, reward(CLEAR_PRIZE[diff])));
  if (!stats.clearChest && Object.keys(CLEAR_WEEK).every(clearWon)) { stats.clearChest = 1; saveStats(); toast(t('tClearChest', giveChest())); }
}

// A chest: one of every power-up, kept until used. Returns "+1 X, +1 Y…" for its note.
function giveChest(times = 1) {
  for (const tool of Object.keys(HELPS)) for (let i = 0; i < times; i++) giveHelp(tool);
  return Object.keys(HELPS).map(k => `+${times} ${t(k)}`).join(', ');
}

// The 22:00 reminder (remind.js) for a streak of 2+ days that would end at midnight; re-planned when it changes.
function remind(ask) {
  const today = dayNumber(new Date()), streak = stats.day >= today - 1 ? stats.streak : 0; // missed a day: no streak left
  planReminder(streak, stats.day === today, t('remindText', streak), ask);
}

function checkScore() {
  for (const [g, m] of Object.entries(SCORE_MODE)) if (mode === m && score >= SCORE_GOAL[g][diff]) unlock(`${g.toLowerCase()}_${diff}`);
}
// Records made before these achievements existed count too (boards hold each mode's best scores).
function checkBoards() {
  for (const [g, m] of Object.entries(SCORE_MODE)) for (const [d, goal] of Object.entries(SCORE_GOAL[g]))
    if (Number(boards[m][d][0]) >= goal) unlock(`${g.toLowerCase()}_${d}`);
}
// An achievement's name: per-difficulty score ones are named after their row and difficulty.
function achName(id) {
  const m = id.match(/^([et]score)_(lo|med|hi)$/);
  return m ? `${t('groups')[m[1].toUpperCase()]} · ${t(m[2])}` : t('ach_' + id)[0];
}

// An ACH achievement got: once only, with its reward.
function unlock(id) {
  if (stats.got[id]) return;
  stats.got[id] = 1; saveStats();
  const name = achName(id);
  toast(ACH[id][1] === 'chest' ? t('tAchChest', name, giveChest()) : t('tAch', name, reward(ACH[id][1])));
}
function reward(kind) { // gives it; returns its name for the toast
  if (kind !== 'rainbow') return t(giveHelp());
  rainbows++; saveRainbows(); hud();
  return t('rainbowFruit');
}

// A short note at the top (rewards, achievements), with a little fanfare.
function toast(text, fanfare = true) {
  const el = document.createElement('div');
  el.className = 'toast'; el.textContent = text;
  el.addEventListener('animationend', () => el.remove());
  $('toasts').appendChild(el);
  if (fanfare) sfx.prize();
}

// Optional rewarded ads (ads.js): an AD badge on a power-up that has run out (the "you lost" window and the
// power-ups window) gives one of it; and with no rainbow
// fruit left, the badge on it before a game gives one, up to RAINBOW_ADS times a day. Sound is held while it plays.
function rainbowAdsLeft() {
  let a = null;
  try { a = JSON.parse(localStorage.getItem('adDay')); } catch {}
  return a?.day === dayNumber(new Date()) ? Math.max(0, RAINBOW_ADS - count(a.n)) : RAINBOW_ADS;
}
const rainbowAd = () => adReady() && rainbowAdsLeft() > 0;
async function adHelp(tool) {
  if (await watchAd()) toast(t('tAd', t(giveHelp(tool))));
  hud();
}
async function watchAd() {
  hush(true);
  const result = await showAd();
  hush(false);
  if (result === 'failed') toast(t('adFail'), false);
  return result === 'rewarded';
}

// Once a day, on the menu: one random help, kept until used.
function dailyGift() {
  const today = new Date().toDateString();
  try {
    if (localStorage.getItem('gift') === today) return;
    localStorage.setItem('gift', today);
  } catch { return; } // no storage: no way to give it only once a day
  toast(t('tGift', t(giveHelp())));
}

// A free random help (daily gift, achievement), kept until used; mid-game it is usable at once. Returns which.
function giveHelp(t = Object.keys(HELPS)[Math.floor(Math.random() * Object.keys(HELPS).length)]) {
  extras[t]++; saveExtras();
  if (inGame()) helps[t]++; else helps = fullHelps(); // mid-game (or paused): keep what this game has used
  hud();
  return t;
}

function updateFire(dt, fromPiece = true) {
  for (const p of fire) { p.x += p.vx * dt; p.y += p.vy * dt; p.t -= dt; }
  fire = fire.filter(p => p.t > 0);
  const f = FIRE[fireLevel()];
  if (!f || !fromPiece) return;
  for (let k = 0; k < f.n; k++) {
    const cx = Math.floor(Math.random() * piece.s.w);
    let cy = 0;
    while (cy < piece.s.h && !piece.s.px[cy * piece.s.w + cx]) cy++;
    if (cy === piece.s.h) continue; // empty column of the sprite
    fire.push({ x: piece.x + cx, y: piece.y + cy, vx: (Math.random() - 0.5) * 12,
      vy: -f.up * (0.6 + Math.random() * 0.6), t: f.life, life: f.life, size: f.size });
  }
}

function tick(dt) {
  frame++; playT += dt; // the clock only runs in play, not while a help is chosen or acting (as in the original)
  if (mode === 'time' && playT >= TIME_LIMIT) return gameOver('time');
  const sp = speed();
  combo.tick(dt);
  music.speed((1 + 0.05 * level()) * (1 + 0.08 * (combo.mult - 1))); // faster with each level and with a bigger bonus
  updateFire(dt);
  if (flash) {
    flashT -= dt;
    if (flashT > 0) return;
    const cls = grid[flash[0]] >> 2, fruits = fruitsIn(grid, flash), withRainbow = flash.some(p => grid[p] >> 2 === JOKER);
    for (const p of flash) grid[p] = 0;
    const pts = combo.clear(flash.length);
    score += pts; lines++; popScore(flash, pts, cls); if (!tut) countLine(fruits, withRainbow, flash.bridge); flash = null; hud(); bump();
    if (tut?.step === 'drop') tutStep('cleared');
    sfx.clear(combo.mult);
    if (mode === 'clear' && lines >= CLEAR_LINES) return gameOver('cleared');
  }
  sandAcc += dt * SAND_RATE * sp;
  for (; sandAcc >= 1; sandAcc--) step(grid); // always on, no friction
  if (frame % 4 === 0) {
    const c = findClear(grid);
    if (c.length) { flash = c; flashT = 0.35; flashMask = new Uint8Array(W * H); for (const p of c) flashMask[p] = 1; return; }
  }
  const dir = keys.right - keys.left, fast = keys.down || touchFast;
  if (dir) slideTo(clampX(piece.x + 2 * dir, piece.s)); // 2 grains per frame, as in the original
  if (tut) tutTick();
  if (!piece.falling) {
    if (tut?.step === 'move' || tut?.step === 'rotate' || tut?.step === 'power') return; // the fruit waits until the player has tried
    holdLeft -= dt;
    if (holdLeft <= 0 || fast) piece.falling = true;
  } else {
    fallAcc += dt * (FALL_SPEED * sp + (fast ? FAST_BONUS : 0));
    if (fast) { score++; $('score').textContent = score; } // 1 point per frame of speeding up, as in the original
    while (fallAcc >= 1) {
      fallAcc--;
      if (collides(grid, piece.s, piece.x, piece.y + 1)) {
        stamp(grid, piece.s, piece.x, piece.y); hud();
        if (tut) tut.landed = playT;
        sfx.land(); shake = 3; // 3px jolt on landing, gone in 3 frames, as in the original
        if (aboveLine()) { lose(); break; } // sand only gets over the line when a fruit lands there: lost at once
        spawn(); break;
      }
      piece.y++;
    }
  }
}

function put(x, y, c, a = 1) {
  const i = (y * PW + x) * 4;
  buf[i] += (c[0] - buf[i]) * a; buf[i + 1] += (c[1] - buf[i + 1]) * a; buf[i + 2] += (c[2] - buf[i + 2]) * a;
}

function drawSprite(s, px, py, a) {
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
    const v = s.px[y * s.w + x];
    if (v && py + y >= 0) put(px + x, py + y, PALETTE[v], a);
  }
}

function render() {
  const blink = flash && (frame >> 2) & 1;
  for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) {
    const i = y * W + x, v = grid[i], o = (y * PW + x) * 4;
    const c = blink && flashMask[i] ? WHITE : v ? PALETTE[v] : y === HOLD_ROWS && x % 4 < 2 ? LINE : BG;
    buf[o] = c[0]; buf[o + 1] = c[1]; buf[o + 2] = c[2]; buf[o + 3] = 255;
  }
  if (piece && (state === 'play' || state === 'aim' || keepPiece)) {
    if (!piece.falling) {
      const f = holdLeft / holdTime, bar = [255, 255 * f, 255 * f];
      for (let x = 0; x < PW * f; x++) { put(x, 0, bar); put(x, 1, bar); }
    }
    let gy = piece.y;
    while (!collides(grid, piece.s, piece.x, gy + 1)) gy++;
    drawSprite(piece.s, piece.x, gy, 0.3); // ghost: where it lands from here
    drawSprite(piece.s, piece.x, piece.y, 1);
  }
  for (const p of fire) {
    const a = p.t / p.life, c = p.c || FLAME[a > 0.8 ? 0 : a > 0.45 ? 1 : 2];
    for (let dy = 0; dy < p.size; dy++) for (let dx = 0; dx < p.size; dx++) {
      const x = Math.round(p.x) + dx, y = Math.round(p.y) + dy;
      if (x >= 0 && x < PW && y >= 0 && y < PH) put(x, y, c, Math.min(1, a * 2));
    }
  }
  const tick2 = (performance.now() / 300 | 0) & 1; // tutorial blink, also while its game waits
  if (tut?.step === 'drop' && tick2) // an arrow over the gap in the floor
    ARROW.forEach((r, y) => [...r].forEach((ch, x) => ch === '#' && put(((TUT_GAP[0] + TUT_GAP[1]) >> 1) - 3 + x, H - 16 + y, WHITE)));
  if (tut?.step === 'lose' && tick2) for (let x = 0; x < PW; x++) put(x, HOLD_ROWS, [255, 60, 60]);
  if (carry?.at) { // what the dragged help would hit: dashed circle, or the knife's band
    const [cx, cy] = carry.at, R = carry.tool === 'choc' ? BLAST_R : BLEND_R;
    if (carry.tool === 'knife') {
      for (const y of [cy - KNIFE_H - 1, cy + KNIFE_H + 1]) if (y >= 0 && y < PH) for (let x = 0; x < PW; x++) if (x % 3) put(x, y, WHITE, 0.8);
    } else for (let y = cy - R - 1; y <= cy + R + 1; y++) for (let x = cx - R - 1; x <= cx + R + 1; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (x >= 0 && x < PW && y >= 0 && y < PH && Math.abs(d - R) < 0.6 && (x + y) % 3) put(x, y, WHITE, 0.8);
    }
  }
  ctx.putImageData(img, 0, 0);
  multEl.style.backgroundSize = `${combo.mult > 1 ? combo.left * 100 : 0}% 3px`; // bonus time left
  const txt = info();
  if (txt !== infoShown) { $('info').textContent = txt; infoShown = txt; } // the clock ticks here, not in hud()
  // landing: a short 3px drop (as in the original); chocolate: a bigger random rattle that dies down
  if (shake > 0) shake--;
  if (quake > 0) quake--;
  const j = () => (Math.random() * 2 - 1) * quake * 0.35 * scale;
  const t = shake || quake ? `translate(${quake ? j() : 0}px, ${shake * scale + (quake ? j() : 0)}px)` : '';
  if (t !== shown) { document.body.style.transform = t; shown = t; }
}

// "+640 x3" rising from the middle of a cleared line, in that fruit's colour; bigger with the bonus.
function popScore(cells, pts, cls) {
  let y0 = H, y1 = 0;
  for (const p of cells) { const y = (p / W) | 0; y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const r = cv.getBoundingClientRect(), el = document.createElement('div');
  el.className = 'pop';
  el.textContent = `+${pts}${combo.mult > 1 ? ` x${combo.mult}` : ''}`;
  el.style.left = r.left + r.width / 2 + 'px';
  el.style.top = r.top + (y0 + y1) / 2 / H * r.height + 'px';
  el.style.color = `rgb(${PALETTE[cls * 4 + 2]})`;
  el.style.fontSize = Math.min(44, 22 + 2 * combo.mult) + 'px';
  el.addEventListener('animationend', () => el.remove());
  document.body.appendChild(el);
}

function bump() { // HUD score pulses when a clear lands
  const s = $('score');
  s.classList.remove('bump'); void s.offsetWidth; s.classList.add('bump'); // reflow restarts the animation
}

function drawIcon(c, name) {
  const { col, rows } = ICONS[name];
  c.width = rows[0].length; c.height = rows.length;
  const g = c.getContext('2d'), d = g.createImageData(c.width, c.height);
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (col[ch]) { d.data.set(col[ch], (y * c.width + x) * 4); d.data[(y * c.width + x) * 4 + 3] = 255; }
  }));
  g.putImageData(d, 0, 0);
}

function paintSprite(c, s) {
  c.width = s.w; c.height = s.h;
  const g = c.getContext('2d'), d = g.createImageData(s.w, s.h);
  for (let i = 0; i < s.px.length; i++) {
    const col = PALETTE[s.px[i]];
    if (col) { d.data.set(col, i * 4); d.data[i * 4 + 3] = 255; }
  }
  g.putImageData(d, 0, 0);
}

function drawNext() {
  const s = next, d = nctx.createImageData(s.w, s.h);
  for (let i = 0; i < s.px.length; i++) {
    const c = PALETTE[s.px[i]];
    if (c) { d.data.set(c, i * 4); d.data[i * 4 + 3] = 255; }
  }
  nctx.clearRect(0, 0, NEXT, NEXT);
  nctx.putImageData(d, (NEXT - s.w) >> 1, (NEXT - s.h) >> 1);
}

// The selected mode's top 5 per difficulty; `rank` highlights the entry just made.
function drawBoard(rank = -1) {
  $('boardTitle').textContent = `${t(mode)} · ${t(mode === 'clear' ? 'fastest' : 'topScores')}`;
  $('board').innerHTML = Object.keys(DIFF).map(d => `<div class="col" data-d="${d}"><b>${t(d)}</b>${
    Array.from({ length: BOARD }, (_, i) => // stored values come from localStorage: fmt() renders numbers only
      `<span${d === diff && i === rank ? ' class="new"' : ''}>${i + 1}. ${fmt(mode, Number(boards[mode][d][i] ?? NaN))}</span>`
    ).join('')}</div>`).join('');
}

const info = () => mode === 'time' ? `⏱ ${clock(Math.ceil(Math.max(0, TIME_LIMIT - playT)))} · ${t('lines', lines)}`
  : mode === 'clear' ? `⏱ ${clock(playT)} · ${t('toGo', Math.max(0, CLEAR_LINES - lines))}`
  : `${t('lv')} ${level() + 1} · ${t('lines', lines)}`;

function hud() {
  $('score').textContent = score; $('best').textContent = bestOf(mode, diff);
  multEl.textContent = combo.mult > 1 ? `x${combo.mult}` : '';
  multEl.style.color = FIRE_CSS[fireLevel()];
  for (const b of document.querySelectorAll('#diff button')) b.classList.toggle('on', b.dataset.d === diff);
  for (const b of document.querySelectorAll('#modes button')) b.classList.toggle('on', b.dataset.m === mode);
  for (const n of document.querySelectorAll('[data-n]')) n.textContent = helps[n.dataset.n];
  for (const b of document.querySelectorAll('.help-src')) {
    const empty = !helps[b.dataset.tool];
    b.classList.toggle('adable', empty && adReady());
    b.disabled = empty && !adReady();
  }
  $('rbN').textContent = rainbows;
  $('rbGet').classList.toggle('adable', !rainbows && rainbowAd()); $('rbYes').disabled = !rainbows;
  $('exit').hidden = state === 'menu' || state === 'over' || state === 'ask';
  $('pow').hidden = inGame(); $('powSm').hidden = !inGame(); // in a game the small one sits by the power-up counts
}

// Leaving a game: the ✕ button, Esc and Android's back button all ask first; back on the menu closes the app.
function askQuit() {
  if (carry) { carry.at = null; return dropCarry(); } // while a help waits for a tap, back just puts it back
  if (!PLAYING.includes(state)) return;
  pause(); $('quit').hidden = false;
}

const PLAYING = ['play', 'rescue', 'settle', 'quake', 'aim'];
const inGame = () => PLAYING.includes(state === 'paused' ? pausedFrom : state);
function pause() { pausedFrom = state; state = 'paused'; keys.left = keys.right = keys.down = 0; g0 = null; touchFast = false; }
function resume() { state = pausedFrom; $('quit').hidden = $('settings').hidden = true; document.activeElement?.blur(); }

// The ⚙ / 🏆 window: switches, how to play, achievements, credits. Opened mid-game (or when the app
// goes to the background) it is the pause menu until closed. `home`: the view it opened on, where BACK closes it.
const VIEWS = ['setMain', 'welcome', 'howto', 'trophies', 'credits', 'powers'];
let view = 'setMain', home = 'setMain', resetAt = -1e9;
// `atStart`: the short How to play at start-up, with DON'T SHOW THIS AGAIN instead of BACK.
function openSettings(v = 'setMain', atStart = false) {
  if (carry || state === 'paused') return; // not over a dragged help or the "leave this game?" question
  const paused = PLAYING.includes(state);
  if (paused) pause();
  $('setTitle').textContent = t(paused ? 'paused' : 'settings'); $('setGo').hidden = !paused;
  $('resetTxt').textContent = t('reset'); resetAt = -1e9;
  $('adPrivacy').hidden = !needsAdPrivacy();
  $('noShow').hidden = !atStart; $('welcome').querySelector('.back').hidden = atStart; // at start-up the ✕ closes it
  $('tutBtn').hidden = paused; // only from the menu: it starts a game
  home = v; show(v); $('settings').hidden = false;
}
function welcome() {
  try { if (localStorage.getItem('noHowto') === '1') return; } catch {}
  openSettings('welcome', true);
}
function closeSettings() {
  if (state === 'paused') return resume();
  $('settings').hidden = true; document.activeElement?.blur();
}
function show(v) {
  view = v;
  for (const id of VIEWS) $(id).hidden = id !== v;
  if (v === 'trophies') drawTrophies();
}
const back = () => view === home ? closeSettings() : show(home);

// The trophy screen. An achievement with rising levels gets one row of gifts, one per level (🎁 a power-up,
// 🌈 a rainbow fruit, 🧰 a chest), dimmed until that level is won. First the weekly challenges, then the rest.
const PRIZE = { help: '🎁', rainbow: '🌈', chest: '🧰' };
const gifts = levels => levels.map(([kind, won]) => won ? PRIZE[kind] : `<i>${PRIZE[kind]}</i>`).join(''); // [[kind, won]…]
const TIERED = { COMBO: ['combo5', 'combo10'], ENDLESS: ['lv5', 'lv9'] }; // levels won one after another
function drawTrophies() {
  // texts are our own (lang.js) and stats are sanitised numbers (loadStats), so this HTML is safe
  checkWeek();
  const row = (cls, pic, name, small, right) => `<div class="${cls}">${pic}<span>${name}<br><small>${small}</small></span><b>${right}</b></div>`;
  const stars = stats.fruit.reduce((a, n) => a + tier(n), 0), all = FRUITS.length * TIERS.length;
  const done = text => `${text} · ✓ ${t('done')}`;
  const nextClear = Object.keys(CLEAR_WEEK).find(d => !clearWon(d)), cd = nextClear || 'hi'; // easiest not won yet
  const cBest = nextClear && stats.clearBest[cd] ? ` · ${t('weekBest', clock(stats.clearBest[cd] / 1000, true))}` : '';
  let html = `<p class="grp">${t('weekly', daysLeft(new Date()))}</p>`
    + FRUITS.map((f, i) => {
      const n = stats.fruit[i + 1], k = tier(n);
      return row('trophy', `<canvas data-f="${i}"></canvas>`, t('fruits')[i], k < TIERS.length ? t('linesOf', n, TIERS[k]) : done(t('lines', TIERS.at(-1))),
        gifts(TIERS.map((_, j) => [j === TIERS.length - 1 ? 'rainbow' : 'help', j < k])));
    }).join('')
    + row(`trophy${stats.chest ? '' : ' shut'}`, '<canvas data-icon="chest"></canvas>', t('chest'),
      stats.chest ? t('chestOpened') : t('chestInfo', all), `${stars}/${all}`)
    + row('ach got', '', t('clear'), nextClear ? `${t(cd)} &lt; ${CLEAR_WEEK[cd]}:00${cBest}` : done(`${t(cd)} &lt; ${CLEAR_WEEK[cd]}:00`),
      gifts(Object.keys(CLEAR_WEEK).map(d => [CLEAR_PRIZE[d], clearWon(d)])))
    + row(`trophy${stats.clearChest ? '' : ' shut'}`, '<canvas data-icon="chest"></canvas>', t('clearChest'),
      stats.clearChest ? t('chestOpened') : t('clearChestInfo'), `${Object.keys(CLEAR_WEEK).filter(clearWon).length}/3`)
    + `<p class="grp">${t('achTitle')}</p>`;
  for (const g of ['COMBO', 'ESCORE', 'TSCORE', 'ENDLESS']) {
    if (TIERED[g]) { // the next level's goal, or all done
      const ids = TIERED[g], k = ids.filter(id => stats.got[id]).length;
      html += row('ach got', '', t('groups')[g], k < ids.length ? t('ach_' + ids[k])[1] : done(t('ach_' + ids.at(-1))[1]), gifts(ids.map(id => [ACH[id][1], stats.got[id]])));
    } else { // a gift per difficulty, lit once that score is reached there
      const ids = Object.keys(SCORE_GOAL[g]).map(d => `${g.toLowerCase()}_${d}`), next = Object.keys(SCORE_GOAL[g]).find(d => !stats.got[`${g.toLowerCase()}_${d}`]);
      const goal = d => `${t(d)} ≥ ${SCORE_GOAL[g][d].toLocaleString(lang)}`;
      html += row('ach got', '', t('groups')[g], next ? goal(next) : done(goal('hi')),
        gifts(ids.map(id => [ACH[id][1], stats.got[id]])));
    }
  }
  let group = '';
  for (const [id, [g, kind, prog]] of Object.entries(ACH)) {
    if (TIERED[g] || SCORE_GOAL[g]) continue;
    if (g !== group) { html += `<p class="grp">${t('groups')[g]}</p>`; group = g; }
    const [name, how] = t('ach_' + id), got = stats.got[id], p = !got && prog?.();
    html += row(`ach${got ? ' got' : ''}`, '', name, how + (p ? ` · ${Math.min(p[0], p[1])}/${p[1]}` : ''), gifts([[kind, got]]));
  }
  // growing milestones: the next one, how far along, and how many chests it gives (×n)
  const today = dayNumber(new Date()), streak = stats.day >= today - 1 ? stats.streak : 0;
  const nd = Math.floor(streak / 7) + 1, ng = stats.gamesChests + 1;
  const loyal = (name, progress, n) => row('ach got', '', name, progress, `<i>${PRIZE.chest}</i>×${n}`);
  html += `<p class="grp">${t('groups').LOYAL}</p>` + loyal(t('daysName', nd * 7), t('daysOf', streak, nd * 7), nd)
    + loyal(t('gamesName', ng * 100), t('gamesOf', stats.games, ng * 100), ng);
  $('trophyList').innerHTML = html;
  for (const c of $('trophyList').querySelectorAll('canvas[data-f]')) paintSprite(c, FRUITS[c.dataset.f].sprite);
  for (const c of $('trophyList').querySelectorAll('[data-icon="chest"]')) drawIcon(c, 'chest');
  const won = Object.keys(ACH).filter(id => stats.got[id]).length; // old ids don't count
  $('trophyCount').textContent = `${won} / ${Object.keys(ACH).length}`;
  $('rbNext').textContent = t('nextRainbow', RAINBOW_EVERY - stats.lines % RAINBOW_EVERY);
}

// Two taps within 3 s, so one stray tap can't wipe the scores.
function resetScores() {
  if (performance.now() - resetAt > 3000) { resetAt = performance.now(); $('resetTxt').textContent = t('resetAgain'); return; }
  boards = Object.fromEntries(Object.keys(MODES).map(m => [m, { lo: [], med: [], hi: [] }]));
  saveBoards(); drawBoard(); hud(); resetAt = -1e9;
  $('resetTxt').textContent = t('resetDone');
}

function toMenu() {
  endTutorial();
  for (const id of ['quit', 'rescue', 'prestart']) $(id).hidden = true;
  state = 'menu'; music.start('menu'); document.activeElement?.blur();
  $('title').textContent = MENU_TITLE; $('msg').innerHTML = t('menuMsg');
  drawBoard(); $('overlay').hidden = false; hud();
  dailyGift(); checkBoards(); remind(false);
}

// START: if you own a rainbow (or an ad can give one), ask whether to spend one on this game, then play.
function start() {
  if (state === 'over' && performance.now() - overAt < 600) return; // the move that lost shouldn't restart
  document.activeElement?.blur(); // else Space during play would "click" the focused button and restart
  if (!rainbows && !rainbowAd()) return begin(false);
  state = 'ask'; hud(); $('prestart').hidden = false;
}

function begin(useRainbow) {
  rainbowOn = useRainbow && rainbows > 0;
  if (rainbowOn) { rainbows--; saveRainbows(); } $('prestart').hidden = true; document.activeElement?.blur();
  newGame();
  sfx.start(); music.start();
}

function muteLabels() {
  for (const [id, kind] of [['mmusic', 'music'], ['msfx', 'sfx'], ['mvibe', 'vibe']]) {
    $(id).lastElementChild.textContent = t('toggle', t(kind), t(isMuted(kind) ? 'off' : 'on')); // after the icon
    $(id).setAttribute('aria-pressed', !isMuted(kind));
  }
}
function mute(kind) { toggleMute(kind); muteLabels(); document.activeElement?.blur(); }

// Language: saved choice, else the device's language if we have it, else English. Fixed texts carry data-t;
// the ones built in code are redrawn here.
function applyLang() {
  document.documentElement.lang = lang;
  for (const el of document.querySelectorAll('[data-t]')) el.innerHTML = t(el.dataset.t); // our own strings from lang.js
  for (const b of $('langs').children) b.setAttribute('aria-pressed', b.dataset.lang === lang);
  muteLabels(); drawBoard(); hud(); infoShown = '';
  if (state === 'menu') $('msg').innerHTML = t('menuMsg');
  $('setTitle').textContent = t(state === 'paused' && pausedFrom ? 'paused' : 'settings'); $('resetTxt').textContent = t('reset');
  if (!$('trophies').hidden) drawTrophies();
  if (tut) tutShow();
}
function chooseLang(code) {
  setLang(code);
  try { localStorage.setItem('lang', code); } catch {}
  applyLang();
}
for (const [code, name] of Object.entries(LANGS)) { // a pixel flag per language
  const b = document.createElement('button'), c = document.createElement('canvas'), [w, h] = FLAG_SIZE;
  c.width = w; c.height = h;
  const g = c.getContext('2d'), d = g.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d.data.set([...flagPx(code, x, y), 255], (y * w + x) * 4);
  g.putImageData(d, 0, 0);
  b.dataset.lang = code; b.setAttribute('aria-label', name); b.title = name; b.append(c);
  b.addEventListener('click', () => chooseLang(code));
  $('langs').append(b);
}
try { setLang(pickLang(localStorage.getItem('lang'), navigator.languages || [navigator.language])); }
catch { setLang(pickLang(null, navigator.languages || [navigator.language])); }

function fit() {
  const b = getComputedStyle(document.body), bars = parseFloat(b.paddingTop) + parseFloat(b.paddingBottom); // system bars
  const room = innerHeight - bars, pad = Math.max(PAD_MIN, room * PAD);
  const s = Math.min(innerWidth / PW, (room - $('hud').offsetHeight - 12 - pad) / PH);
  scale = s; // fill the space; at phone pixel densities uneven pixel sizes don't show
  cv.style.width = PW * scale + 'px'; cv.style.height = PH * scale + 'px';
}

for (const b of document.querySelectorAll('#diff button')) b.addEventListener('click', () => { diff = b.dataset.d; saveDiff(); hud(); b.blur(); });
$('go').addEventListener('click', () => { if (state === 'menu' || state === 'over') start(); });
$('mmusic').addEventListener('click', () => mute('music'));
$('msfx').addEventListener('click', () => mute('sfx'));
$('mvibe').addEventListener('click', () => mute('vibe'));
$('gear').addEventListener('click', () => openSettings());
$('trophy').addEventListener('click', () => openSettings('trophies'));
$('pow').addEventListener('click', () => openSettings('powers'));
$('powSm').addEventListener('click', () => openSettings('powers'));
$('setX').addEventListener('click', closeSettings);
$('setGo').addEventListener('click', closeSettings);
$('reset').addEventListener('click', resetScores);
$('tutBtn').addEventListener('click', () => { if (state === 'menu' || state === 'over') startTutorial(); });
$('tutNext').addEventListener('click', () => { if (!tut) return; if (tut.step === 'cleared') tutStep('power'); else if (tut.step === 'lose') tutStep('done'); else toMenu(); });
$('tutSkip').addEventListener('click', () => { if (tut) toMenu(); });
$('noShow').addEventListener('click', () => { try { localStorage.setItem('noHowto', '1'); } catch {} closeSettings(); });
for (const b of document.querySelectorAll('#settings [data-view]')) b.addEventListener('click', () => show(b.dataset.view));
for (const b of document.querySelectorAll('#settings .back')) b.addEventListener('click', back);
// leaving the app mid-game (a call, the home button) pauses it
document.addEventListener('visibilitychange', () => { if (document.hidden && PLAYING.includes(state) && !adShowing()) openSettings(); });
for (const b of document.querySelectorAll('#powList .help-src')) b.addEventListener('click', () => {
  if (!helps[b.dataset.tool]) adHelp(b.dataset.tool);
  else if (state === 'paused' && pausedFrom === 'play') useMidGame(b.dataset.tool);
});
$('rbGet').addEventListener('click', async () => {
  if (state !== 'ask' || rainbows || !rainbowAd()) return;
  if (await watchAd()) {
    try { localStorage.setItem('adDay', JSON.stringify({ day: dayNumber(new Date()), n: RAINBOW_ADS - rainbowAdsLeft() + 1 })); } catch {}
    rainbows++; saveRainbows(); toast(t('tAd', t('rainbowFruit')));
  }
  hud();
});
$('adPrivacy').addEventListener('click', adPrivacyOptions);
$('giveup').addEventListener('click', () => { if (state === 'rescue') gameOver('lost'); });
for (const b of document.querySelectorAll('#helps .help-src')) b.addEventListener('click', pick);
for (const c of document.querySelectorAll('canvas[data-icon]')) drawIcon(c, c.dataset.icon);
paintSprite($('rbIcon'), RAINBOW.sprite);
$('rbYes').addEventListener('click', () => { if (state === 'ask') begin(true); });
$('rbNo').addEventListener('click', () => { if (state === 'ask') begin(false); });
$('rbX').addEventListener('click', () => { if (state === 'ask') toMenu(); });
$('exit').addEventListener('click', askQuit);
$('qGo').addEventListener('click', resume);
$('qMenu').addEventListener('click', toMenu);
App?.addListener('backButton', () => { // registering this replaces Android's default "back closes the app"
  if (!$('settings').hidden) back();
  else if (state === 'paused') resume();
  else if (state === 'ask') toMenu();
  else if (state === 'menu' || state === 'over' || state === 'intro') App.exitApp();
  else askQuit();
});
for (const b of document.querySelectorAll('#modes button')) b.addEventListener('click', () => {
  mode = b.dataset.m; saveMode(); drawBoard(); hud(); b.blur();
});

// Helps: tap one (in the "you lost" prompt or the 💪 window), then tap the sand: it acts where the finger
// lifts, and sliding before lifting moves the aim. The earthquake just needs the first tap.
addEventListener('pointerdown', e => {
  if (carry) { moveCarry(e); return; }
  if (state !== 'play' || e.target.closest('button')) return; // buttons aren't game input
  g0 = { x: e.clientX, y: e.clientY, t: e.timeStamp, px: piece.x, axis: null };
});
addEventListener('pointermove', e => {
  if (carry) { moveCarry(e); return; }
  if (!g0) return;
  const dx = e.clientX - g0.x, dy = e.clientY - g0.y;
  if (!g0.axis && Math.hypot(dx, dy) > 12) g0.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
  if (g0.axis === 'x') slideTo(clampX(g0.px + Math.round(dx * W / cv.clientWidth), piece.s));
  if (g0.axis === 'y' && dy > 40) touchFast = true; // stays on until the finger lifts
});
addEventListener('pointerup', e => {
  if (carry) { moveCarry(e); return dropCarry(); } // used where the finger lifts
  if (g0 && !g0.axis && e.timeStamp - g0.t < 300) rotate();
  g0 = null; touchFast = false;
});
addEventListener('pointercancel', () => { g0 = null; touchFast = false; });

// Arrows or WASD, as in the original: ←/→ move while held, ↑ rotates, ↓ speeds up while held.
// M toggles music, N toggles sound effects.
const KEY = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowDown: 'down', KeyS: 'down', ArrowUp: 'up', KeyW: 'up' };
addEventListener('keydown', e => {
  if (e.code === 'KeyM' && !e.repeat) return mute('music');
  if (e.code === 'KeyN' && !e.repeat) return mute('sfx');
  if (!$('settings').hidden) { if (e.code === 'Escape') back(); return; } // no game keys behind it
  if (e.code === 'Escape' && state !== 'ask') return state === 'paused' ? resume() : askQuit(); // Esc = the ✕ button
  if (state === 'menu' || state === 'over') { if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); start(); } return; }
  if (state === 'ask') { if (e.code === 'Enter') begin(true); else if (e.code === 'Escape') begin(false); return; }
  if (state !== 'play') return;
  const k = KEY[e.code];
  if (!k) return;
  e.preventDefault();
  if (k === 'up') { if (!e.repeat) rotate(); }
  else if (k !== 'down' || !e.repeat) keys[k] = 1; // a held ↓ doesn't carry over to the next fruit
});
addEventListener('keyup', e => { const k = KEY[e.code]; if (k && k !== 'up') keys[k] = 0; });
addEventListener('blur', () => { keys.left = keys.right = keys.down = 0; });
new ResizeObserver(fit).observe(document.body); // also fires when Capacitor sets the bar insets after load

let last = performance.now(), acc = 0;
function loop(now) {
  acc += Math.min(0.1, (now - last) / 1000); last = now; // clamp so returning from background doesn't fast-forward
  while (acc >= 1 / 60) {
    if (state === 'play' && !tut?.freeze) tick(1 / 60); else if (state === 'settle') settle(1 / 60); else if (state === 'quake') quakeTick(1 / 60);
    acc -= 1 / 60;
  }
  render();
  requestAnimationFrame(loop);
}

applyLang(); fit(); requestAnimationFrame(loop);
intro(() => { toMenu(); tutSeen() ? welcome() : startTutorial(); initAds(hud); }); // the title screen covers the menu until its sand has settled
