// Title screen: FRUIT SALAD in 3D pixel letters over every fruit, and TAP TO PLAY. A tap brings on the drama:
// it all trembles, falls, crashes onto the floor (with a quake) and crumbles into sand; then the menu fades in.
// The screen is a grid the size of the well, so the game's own sand code runs it.
import { W, H, PALETTE, FRUITS, RAINBOW, FONT, letter, collides, stamp, step, jitter } from './logic.js';
import { sfx, music, vibrate } from './sfx.js';
import { t as tr } from './lang.js';

const PER_LINE = 16; // 6-grain letters across the 100-grain screen

const G = 320;         // fall acceleration, grains/s²
const TREMBLE = 0.7;   // seconds it all shakes before it falls
const QUAKE = 1.3;     // seconds the floor shakes after the first crash
const BG = [13, 11, 20], TEXT = [244, 233, 200]; // the page's background and text colours

export function intro(done) {
  const cv = document.getElementById('intro'), ctx = cv.getContext('2d'), img = ctx.createImageData(W, H), buf = img.data;
  const grid = new Uint8Array(W * H), bodies = [];
  // Sprites side by side, centred, bottoms on row `base`. Lower layers start falling first, so with the
  // same gravity nothing above can catch up with (and pass through) something below.
  const row = (sprites, base, layer, gap) => {
    let x = (W - sprites.reduce((a, s) => a + s.w + gap, -gap)) >> 1;
    for (const s of sprites) {
      bodies.push({ s, x, y: base - s.h, vy: 0, wait: layer * 0.08 + Math.random() * 0.06, landed: false });
      x += s.w + gap;
    }
  };
  const fruit = n => FRUITS.find(f => f.name === n).sprite;
  row([...'FRUIT'].map(c => letter(c)), 40, 3, 1);
  row([...'SALAD'].map(c => letter(c)), 66, 2, 1);
  row([fruit('banana'), fruit('oranges')], 94, 1, 6);
  row([fruit('strawberry'), fruit('watermelon'), RAINBOW.sprite], 120, 0, 6);
  // TAP TO PLAY in the player's language, word-wrapped to PER_LINE letters, each line centred: [sprite, x, y]
  const lines = [];
  for (const w of tr('tap').split(' ')) {
    if (lines.length && (lines.at(-1) + ' ' + w).length <= PER_LINE) lines[lines.length - 1] += ' ' + w; else lines.push(w);
  }
  const tap = lines.flatMap((txt, r) => [...txt].map((c, i) =>
    FONT[c] && [letter(c, 1, 0), ((W - txt.length * 6 + 1) >> 1) + i * 6, 140 + r * 9]).filter(Boolean));

  let phase = 'title', t = 0, quake = 0, crashed = false, calm = 0, last = performance.now();
  const go = e => {
    if (phase !== 'title' || (e.code && e.code !== 'Enter' && e.code !== 'Space')) return;
    phase = 'tremble'; t = 0; music.start('drama');
  };
  cv.addEventListener('click', go); // click, not pointerdown: a touch only unlocks audio in a browser on click
  addEventListener('keydown', go);
  music.start('intro'); // in the app it plays at once; a browser holds sound back until the first tap

  const hit = () => {
    if (crashed) return sfx.land();
    crashed = true; quake = QUAKE;
    sfx.crash(); vibrate([300, 60, 200]);
  };

  function fall(dt) {
    let busy = 0;
    for (const b of bodies) {
      if (b.landed) continue;
      busy++;
      if ((b.wait -= dt) > 0) continue;
      b.vy += G * dt;
      const to = b.y + b.vy * dt;
      let y = Math.floor(b.y);
      while (y < Math.floor(to) && !collides(grid, b.s, b.x, y + 1)) y++; // grain by grain: never through sand
      if (y < Math.floor(to)) { stamp(grid, b.s, b.x, y); b.landed = true; hit(); } else b.y = to;
    }
    if (quake > 0) { quake -= dt; jitter(grid, 0.3); }
    for (let k = 0; k < 3; k++) busy += step(grid);
    calm = busy || quake > 0 ? 0 : calm + dt;
    if (calm > 0.6) finish(); // a moment to see the sand before the menu
  }

  function finish() {
    phase = 'done'; music.stop(); sfx.whoosh();
    cv.classList.add('out');
    setTimeout(() => { cv.remove(); removeEventListener('keydown', go); done(); }, 600);
  }

  const paint = (s, px, py, col) => {
    for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
      const v = s.px[y * s.w + x], gx = px + x, gy = py + y;
      if (v && gx >= 0 && gx < W && gy >= 0 && gy < H) buf.set(col || PALETTE[v], (gy * W + gx) * 4);
    }
  };

  requestAnimationFrame(function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
    if (phase === 'tremble' && t > TREMBLE) phase = 'fall';
    if (phase === 'fall') fall(dt);
    for (let i = 0; i < W * H; i++) { buf.set(PALETTE[grid[i]] || BG, i * 4); buf[i * 4 + 3] = 255; }
    const jig = () => phase === 'tremble' ? Math.round(Math.random() * 2 - 1) : 0;
    for (const b of bodies) if (!b.landed) paint(b.s, b.x + jig(), Math.floor(b.y) + jig());
    if (phase === 'title' && t % 1 < 0.6) for (const [s, x, y] of tap) paint(s, x, y, TEXT);
    ctx.putImageData(img, 0, 0);
    const a = quake > 0 ? quake / QUAKE * 14 : phase === 'tremble' ? 2 : 0; // shake in css px
    cv.style.transform = a ? `translate(${(Math.random() * 2 - 1) * a}px, ${(Math.random() * 2 - 1) * a}px)` : '';
    if (phase !== 'done') requestAnimationFrame(frame);
  });
}
