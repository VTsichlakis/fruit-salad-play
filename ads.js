// Optional rewarded ads: Google AdMob through @capacitor-community/admob, only inside the Android app.
// In a browser there are none, unless the page is opened with ?fakeads to try the buttons.
// BEFORE RELEASE: put your own rewarded ad unit below and your app ID in android strings.xml (admob_app_id),
// and set TESTING = false. Never tap real ads on your own phone: AdMob can close the account for it.
const AD_UNIT = 'ca-app-pub-3940256099942544/5224354917'; // Google's test rewarded ad unit
const TESTING = true;

// ?fakeads: a pretend ad that rewards after half a second, to try the flow without the app
function fakeAdMob() {
  const on = {};
  return {
    requestConsentInfo: async () => ({ canRequestAds: true, privacyOptionsRequirementStatus: 'REQUIRED' }),
    showConsentForm: async () => ({ canRequestAds: true, privacyOptionsRequirementStatus: 'REQUIRED' }),
    showPrivacyOptionsForm: async () => {}, initialize: async () => {}, prepareRewardVideoAd: async () => ({}),
    addListener: async (ev, fn) => { on[ev] = fn; return { remove: async () => { delete on[ev]; } }; },
    showRewardVideoAd: async () => setTimeout(() => { on.onRewardedVideoAdReward?.({}); on.onRewardedVideoAdDismissed?.(); }, 500),
  };
}
const AdMob = window.Capacitor?.Plugins?.AdMob ?? (location.search.includes('fakeads') ? fakeAdMob() : null);

let ready = false, showing = false, privacy = false, changed = () => {};
export const adReady = () => ready && !showing;
export const adShowing = () => showing;
export const needsAdPrivacy = () => privacy; // the EU/UK consent can be changed from Settings

// After the intro: Google's consent form where the law asks for one, then the first ad loads in the background.
// onChange runs whenever an ad becomes ready or is used, so the buttons can show or hide.
export async function initAds(onChange) {
  if (!AdMob) return;
  changed = onChange;
  try {
    let info = await AdMob.requestConsentInfo();
    if (info.isConsentFormAvailable && info.status === 'REQUIRED') info = await AdMob.showConsentForm();
    privacy = info.privacyOptionsRequirementStatus === 'REQUIRED';
    if (!info.canRequestAds) return changed();
    await AdMob.initialize();
    await load();
  } catch { changed(); } // no ads: the game works the same without them
}

async function load() {
  ready = false;
  try { await AdMob.prepareRewardVideoAd({ adId: AD_UNIT, isTesting: TESTING }); ready = true; } catch {}
  changed();
}

// Shows the loaded ad. Resolves 'rewarded' (watched to the end), 'closed' (closed early) or 'failed'.
// The reward is given once the ad is closed, so its note shows back in the game. The next ad loads after.
export function showAd() {
  if (!adReady()) return Promise.resolve('failed');
  showing = true; changed();
  return new Promise(resolve => {
    let rewarded = false, over = false, handles = [];
    const done = result => {
      if (over) return;
      over = true; showing = false;
      for (const h of handles) h.remove();
      load(); resolve(result);
    };
    Promise.all([
      AdMob.addListener('onRewardedVideoAdReward', () => { rewarded = true; }),
      AdMob.addListener('onRewardedVideoAdDismissed', () => done(rewarded ? 'rewarded' : 'closed')),
      AdMob.addListener('onRewardedVideoAdFailedToShow', () => done('failed')),
    ]).then(h => { handles = h; return AdMob.showRewardVideoAd(); }).catch(() => done('failed'));
  });
}

export async function adPrivacyOptions() {
  try { await AdMob?.showPrivacyOptionsForm(); } catch {}
}
