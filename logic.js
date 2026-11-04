// Pure game logic (no DOM) so it can be unit-tested with `node --test`.
export const U = 12;                 // one strawberry is U×U grains
export const M = 20;                 // watermelon is M×M
export const W = 100, H = 170;       // well size in grains
export const HOLD_ROWS = 3 * U + 3;  // waiting pieces live above this line

const BANANA = 1, STRAWBERRY = 2, MELON = 3, ORANGE = 4;
export const JOKER = 5; // rainbow fruit: its sand joins up with any fruit colour
export const STONE = 6; // Clear 40 floor: never falls, never clears, no help removes it

// palette index = fruit class * 4 + shade; class 0 is empty
export const PALETTE = [
  null, null, null, null,
  [140, 100, 10], [245, 205, 40], [255, 240, 130], [110, 75, 25],    // banana: edge, body, light, tip
  [120, 10, 30], [215, 35, 50], [255, 105, 105], [255, 220, 150],    // strawberry: edge, body, light, seed
  [20, 75, 30], [55, 135, 50], [95, 185, 75], [190, 240, 160],       // watermelon: stripe, mid, body, light
  [150, 60, 0], [245, 140, 20], [255, 190, 80], [255, 230, 170],     // orange: edge, body, light, spare
  [225, 55, 65], [245, 145, 30], [250, 215, 55], [85, 185, 80],      // rainbow: red, orange, yellow, green bands
  [70, 70, 80], [100, 100, 110], [125, 125, 135], [150, 150, 160],   // stone: dark, base, light, top edge
];

// Fill the bottom `rows` rows with stone, in a speckled block texture.
export function stoneFloor(g, rows) {
  for (let y = H - rows; y < H; y++) for (let x = 0; x < W; x++)
    g[y * W + x] = STONE * 4 + (y === H - rows ? 3 : (x * 7 + y * 13) % 5 === 0 ? 0 : (x + y) % 9 === 0 ? 2 : 1);
}
const free = v => v && v >> 2 !== STONE; // sand that can move or be removed

function make(w, h, f) {
  const px = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px[y * w + x] = f(x, y);
  return { w, h, px };
}

const rows = (cls, r) => make(r[0].length, r.length, (x, y) => r[y][x] === '.' ? 0 : cls * 4 + +r[y][x]);

const strawberry = rows(STRAWBERRY, [
  '..00000000..',
  '.0211311110.',
  '021111113110',
  '011311111110',
  '011111131110',
  '.0131111110.',
  '.0111131110.',
  '..01111310..',
  '..01311110..',
  '...011110...',
  '....0110....',
  '.....00.....',
]);

// crescent: thicker in the middle, curving up to brown tips
const banana = make(3 * U, U, (x, y) => {
  const m = (3 * U - 1) / 2, t = (x - m) / m, c = y + 0.5;
  const top = 0.375 * U * (1 - t * t), bot = U * (0.94 - 0.69 * t * t);
  if (c < top || c > bot) return 0;
  return BANANA * 4 + (Math.abs(t) > 0.88 ? 3 : bot - c < 1 ? 0 : c - top < 1 ? 2 : 1);
});

const orange = (x, y) => {
  const c = (U - 1) / 2, r = U / 2, d = Math.hypot(x - c, y - c);
  if (d > r - 0.1) return 0;
  return ORANGE * 4 + (d > r - 1 ? 0 : Math.hypot(x - c * 0.6, y - c * 0.6) < r * 0.35 ? 2 : 1);
};
const oranges = make(2 * U, U, (x, y) => orange(x % U, y));

const melon = make(M, M, (x, y) => {
  const c = (M - 1) / 2, d = Math.hypot(x - c, y - c);
  if (d > c + 0.4) return 0;
  if (d > c - 0.5) return MELON * 4;
  if (Math.hypot(x - c * 0.6, y - c * 0.6) < 2) return MELON * 4 + 3;
  const s = ((x + Math.round(Math.sin(y * 0.6) * 1.2)) % 4 + 4) % 4; // wobbly stripes
  return MELON * 4 + (s === 0 ? 0 : s === 1 ? 1 : 2);
});

export const FRUITS = [
  { name: 'banana', sprite: banana },
  { name: 'strawberry', sprite: strawberry },
  { name: 'watermelon', sprite: melon },
  { name: 'oranges', sprite: oranges },
];

// Round fruit with diagonal bands in the four fruit colours; not in FRUITS, it only turns up by chance.
export const RAINBOW = { name: 'rainbow',
  sprite: make(14, 14, (x, y) => Math.hypot(x - 6.5, y - 6.5) > 6.9 ? 0 : JOKER * 4 + (Math.floor((x + y) / 4) % 4)) };

// Rewards: a rainbow fruit for every RAINBOW_EVERY lines cleared (all games together), and the weekly fruit
// challenge: per fruit a star at each of TIERS lines cleared in that fruit this week.
export const RAINBOW_EVERY = 50;
export const rainbowsEarned = (before, after) => Math.floor(after / RAINBOW_EVERY) - Math.floor(before / RAINBOW_EVERY);
export const TIERS = [10, 50, 100, 250, 500];
export const tier = n => TIERS.filter(t => n >= t).length; // 0 = none yet, 5 = all
// Days in a row: the local calendar day as a number (Math.round absorbs daylight-saving hours), and the
// streak after playing on `today` when the last play was on day `last`.
export const dayNumber = d => Math.round(new Date(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5);
export const nextStreak = (streak, last, today) => last === today ? streak : last === today - 1 ? streak + 1 : 1;
// Weeks run Monday to Sunday (day 0, 1 Jan 1970, was a Thursday); daysLeft counts today, so Sunday is 1.
export const weekNumber = d => Math.floor((dayNumber(d) + 3) / 7);
export const daysLeft = d => 7 - (dayNumber(d) + 3) % 7;
// The fruit classes a clear was made of (rainbow sand counts for whichever fruit it joined).
export function fruitsIn(g, cells) {
  const s = new Set();
  for (const p of cells) { const c = g[p] >> 2; if (c >= BANANA && c <= ORANGE) s.add(c); }
  return [...s];
}

// 5×7 pixel letters for the title screen.
export const FONT = {
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  R: ['####.', '#...#', '#...#', '####.', '#..#.', '#...#', '#...#'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  I: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  // for TAP TO PLAY in the other languages
  C: ['.####', '#....', '#....', '#....', '#....', '#....', '.####'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  G: ['.####', '#....', '#....', '#..##', '#...#', '#...#', '.###.'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  Π: ['#####', '#...#', '#...#', '#...#', '#...#', '#...#', '#...#'],
  Σ: ['#####', '#....', '.#...', '..#..', '.#...', '#....', '#####'],
  Γ: ['#####', '#....', '#....', '#....', '#....', '#....', '#....'],
  Ξ: ['#####', '.....', '.....', '.###.', '.....', '.....', '#####'],
};
// Greek capitals that look like Latin ones share their glyph.
for (const [g, l] of Object.entries({ Α: 'A', Ε: 'E', Η: 'H', Ι: 'I', Ν: 'N', Ο: 'O', Ρ: 'P', Τ: 'T', Υ: 'Y', Ζ: 'Z', Μ: 'M' })) FONT[g] = FONT[l];

// One letter as a sprite, each font cell scale×scale grains: banana-yellow face with a light top edge
// and an orange 3D side `depth` grains deep, so it turns into fruit sand like any fruit.
export function letter(ch, scale = 3, depth = 3) {
  const g = FONT[ch], fw = 5 * scale, fh = 7 * scale;
  const on = (x, y) => x >= 0 && y >= 0 && x < fw && y < fh && g[(y / scale) | 0][(x / scale) | 0] === '#';
  return make(fw + depth, fh + depth, (x, y) => {
    if (on(x, y)) return BANANA * 4 + (on(x, y - 1) ? 1 : 2);
    for (let d = 1; d <= depth; d++) if (on(x - d, y - d)) return ORANGE * 4 + (d < depth ? 1 : 0);
    return 0;
  });
}

// Multiplier: each clear adds 1 (up to x10, as in the original) and restarts a `window`-second
// timer; when the timer runs out it drops one level and waits `stepDown` seconds before the next.
export function makeCombo(window, stepDown = window / 2) {
  let mult = 0, left = 0, period = window;
  return {
    tick(dt) {
      if (left <= 0 || (left -= dt) > 0) return;
      mult--;
      period = stepDown; left = mult > 0 ? period : 0;
    },
    clear(n) { mult = Math.min(10, mult + 1); period = window; left = window; return n * mult; },
    get mult() { return Math.max(1, mult); },
    get left() { return left / period; }, // 1 → 0 until the next drop
  };
}

// 90° clockwise
export const rot = s => make(s.h, s.w, (x, y) => s.px[(s.h - 1 - x) * s.w + y]);

export function collides(g, s, px, py) {
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
    if (!s.px[y * s.w + x]) continue;
    const gx = px + x, gy = py + y;
    if (gx < 0 || gx >= W || gy >= H || (gy >= 0 && g[gy * W + gx])) return true;
  }
  return false;
}

export function stamp(g, s, px, py) {
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
    const v = s.px[y * s.w + x], gy = py + y;
    if (v && gy >= 0) g[gy * W + px + x] = v;
  }
}

// Chocolate bomb: removes every grain within radius r of (cx, cy); returns how many went.
export function blast(g, cx, cy, r) {
  let n = 0;
  for (let y = Math.max(0, cy - r); y <= Math.min(H - 1, cy + r); y++)
    for (let x = Math.max(0, cx - r); x <= Math.min(W - 1, cx + r); x++)
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r && free(g[y * W + x])) { g[y * W + x] = 0; n++; }
  return n;
}

// Knife: removes every grain in rows y0..y1 across the whole width; returns how many went.
export function cut(g, y0, y1) {
  let n = 0;
  for (let y = Math.max(0, y0); y <= Math.min(H - 1, y1); y++)
    for (let x = 0; x < W; x++) if (free(g[y * W + x])) { g[y * W + x] = 0; n++; }
  return n;
}

// Blender: the fruit sand within radius r all becomes the fruit most common there (each grain keeps
// its shade; rainbow sand stays rainbow). Returns that fruit class, or 0 if there was none.
export function blend(g, cx, cy, r) {
  const count = [0, 0, 0, 0, 0], cells = [];
  for (let y = Math.max(0, cy - r); y <= Math.min(H - 1, cy + r); y++)
    for (let x = Math.max(0, cx - r); x <= Math.min(W - 1, cx + r); x++) {
      const p = y * W + x, c = g[p] >> 2;
      if (c >= 1 && c <= 4 && (x - cx) ** 2 + (y - cy) ** 2 <= r * r) { count[c]++; cells.push(p); }
    }
  let best = 0;
  for (let c = 1; c <= 4; c++) if (count[c] > count[best]) best = c;
  if (best) for (const p of cells) g[p] = best * 4 + (g[p] & 3);
  return best;
}

// Earthquake: each grain with an empty cell beside it steps there with chance p. Alternated with
// step(), the nudged grains slide down the slopes and tall piles flatten out.
export function jitter(g, p = 0.5, rnd = Math.random) {
  for (let y = 0; y < H; y++) {
    const rev = rnd() < 0.5; // scan rows both ways so the shake has no side bias
    for (let i = 0; i < W; i++) {
      const x = rev ? W - 1 - i : i, q = y * W + x;
      if (!free(g[q]) || rnd() >= p) continue;
      const d = rnd() < 0.5 ? -1 : 1;
      if (x + d >= 0 && x + d < W && !g[q + d]) { g[q + d] = g[q]; g[q] = 0; }
    }
  }
}

// One gravity pass: columns left to right, each bottom-up; a grain tries down, then down-left, then down-right.
// Returns how many grains moved (0 = the sand has settled).
export function step(g) {
  let n = 0;
  for (let x = 0; x < W; x++) for (let y = H - 2; y >= 0; y--) {
    const p = y * W + x, v = g[p];
    if (!free(v)) continue;
    const b = p + W;
    if (!g[b]) { g[b] = v; g[p] = 0; n++; }
    else if (x > 0 && !g[b - 1]) { g[b - 1] = v; g[p] = 0; n++; }
    else if (x < W - 1 && !g[b + 1]) { g[b + 1] = v; g[p] = 0; n++; }
  }
  return n;
}

// Cells of every same-fruit region (8-connected) that touches both the left and right wall.
// Rainbow sand counts as every fruit, so each fruit is searched with rainbow sand included.
// out.bridge: some rainbow grain is in the lines of two different fruits (a rainbow bridge).
export function findClear(g) {
  const stack = new Int32Array(W * H), taken = new Uint8Array(W * H), owner = new Uint8Array(W * H), out = [];
  for (let cls = 1; cls <= 4; cls++) {
    const seen = new Uint8Array(W * H), fits = q => g[q] && (g[q] >> 2 === cls || g[q] >> 2 === JOKER);
    for (let y = 0; y < H; y++) {
      const s = y * W;
      if (seen[s] || !fits(s)) continue;
      const comp = [];
      let top = 0, right = false;
      stack[top++] = s; seen[s] = 1;
      while (top) {
        const p = stack[--top], px = p % W, py = (p - px) / W;
        comp.push(p);
        if (px === W - 1) right = true;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = px + dx, ny = py + dy, q = ny * W + nx;
          if (nx < 0 || nx >= W || ny < 0 || ny >= H || seen[q] || !fits(q)) continue;
          seen[q] = 1; stack[top++] = q;
        }
      }
      if (!right) continue;
      const fruity = comp.some(p => g[p] >> 2 === cls); // a line of this fruit, not rainbow sand on its own
      for (const p of comp) {
        if (fruity && g[p] >> 2 === JOKER) { if (owner[p] && owner[p] !== cls) out.bridge = true; owner[p] = cls; }
        if (!taken[p]) { taken[p] = 1; out.push(p); } // rainbow cells may join two fruits' lines
      }
    }
  }
  return out;
}
