// The 22:00 reminder: on a day the player hasn't played yet, if a streak of 2+ days would end at midnight.
// Only in the Android app (@capacitor/local-notifications). One notification, re-planned whenever the streak changes;
// "around 22:00": Android may shift it a little, as the app doesn't ask for exact alarms.
const LN = window.Capacitor?.Plugins?.LocalNotifications;
const ID = 7;

export async function planReminder(streak, playedToday, text, ask) {
  if (!LN) return;
  try {
    await LN.cancel({ notifications: [{ id: ID }] });
    if (streak < 2) return;
    let perm = (await LN.checkPermissions()).display;
    if (perm.startsWith('prompt') && ask) perm = (await LN.requestPermissions()).display; // Android 13+ asks once
    if (perm !== 'granted') return;
    const at = new Date();
    at.setHours(22, 0, 0, 0);
    if (playedToday) at.setDate(at.getDate() + 1); // played today: remind tomorrow evening
    else if (at <= new Date()) return; // already past 22:00, and the app is open now anyway
    await LN.schedule({ notifications: [{ id: ID, title: 'Fruit Salad', body: text, schedule: { at, allowWhileIdle: true } }] });
  } catch {} // no notifications: the game works the same
}
