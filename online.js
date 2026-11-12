// World scoreboard: a Firebase Realtime Database over its REST API (no SDK). One list per mode and difficulty:
// scores/<mode>_<diff>/<auto id> = { n: name, v: score (or ms for Clear 40), t: server time }.
// Set DB to your database's URL, e.g. 'https://fruit-salad-xxxx-default-rtdb.europe-west1.firebasedatabase.app'.
// shortcut: anyone can post any score through the open REST API (rules only check the shape); add a server check if cheating shows up.
export const DB = 'https://fruitsalad-138c7-default-rtdb.europe-west1.firebasedatabase.app';
const url = (mode, diff, q = '') => `${DB}/scores/${mode}_${diff}.json${q}`;

export async function postScore(mode, diff, name, value) {
  if (!DB) return;
  await fetch(url(mode, diff), { method: 'POST', body: JSON.stringify({ n: name, v: value, t: { '.sv': 'timestamp' } }),
    signal: AbortSignal.timeout(8000) });
}

// Best `top` entries as [{ n, v }], best first. Clear 40 is a time, so lower is better.
export async function topScores(mode, diff, top) {
  if (!DB) throw new Error('no scoreboard');
  const low = mode === 'clear';
  const r = await fetch(url(mode, diff, `?orderBy="v"&${low ? 'limitToFirst' : 'limitToLast'}=${top}`), { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(r.status);
  return Object.values(await r.json() || {})
    .filter(e => e && typeof e.n === 'string' && Number.isFinite(e.v)) // other players' data: only well-formed rows
    .sort((a, b) => low ? a.v - b.v : b.v - a.v);
}
