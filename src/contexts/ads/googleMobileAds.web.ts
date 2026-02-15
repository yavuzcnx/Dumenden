type Listener = (...args: any[]) => void;

const AdEventType = {
  LOADED: 'loaded',
  CLOSED: 'closed',
  ERROR: 'error',
} as const;

const RewardedAdEventType = {
  LOADED: 'loaded',
  EARNED_REWARD: 'earned_reward',
} as const;

const TestIds = {
  REWARDED: 'TEST_REWARDED',
  INTERSTITIAL: 'TEST_INTERSTITIAL',
  BANNER: 'TEST_BANNER',
} as const;

class MockAd {
  private listeners: Record<string, Set<Listener>> = {};

  addAdEventListener(type: string, listener: Listener) {
    if (!this.listeners[type]) this.listeners[type] = new Set();
    this.listeners[type].add(listener);
    return () => {
      this.listeners[type]?.delete(listener);
    };
  }

  protected emit(type: string, ...args: any[]) {
    const handlers = this.listeners[type];
    if (!handlers) return;
    handlers.forEach((handler) => {
      try {
        handler(...args);
      } catch {}
    });
  }
}

class RewardedAd extends MockAd {
  static createForAdRequest(_adUnitId: string, _opts?: any) {
    return new RewardedAd();
  }

  load() {
    setTimeout(() => {
      this.emit(AdEventType.LOADED);
      this.emit(RewardedAdEventType.LOADED);
    }, 0);
  }

  show() {
    setTimeout(() => {
      const shouldReward = typeof __DEV__ !== 'undefined' ? __DEV__ : true;
      if (shouldReward) this.emit(RewardedAdEventType.EARNED_REWARD, { type: 'reward' });
      this.emit(AdEventType.CLOSED);
    }, 0);
    return Promise.resolve();
  }
}

class InterstitialAd extends MockAd {
  static createForAdRequest(_adUnitId: string, _opts?: any) {
    return new InterstitialAd();
  }

  load() {
    setTimeout(() => this.emit(AdEventType.LOADED), 0);
  }

  show() {
    setTimeout(() => this.emit(AdEventType.CLOSED), 0);
    return Promise.resolve();
  }
}

const BannerAdSize = {
  ANCHORED_ADAPTIVE_BANNER: 'ANCHORED_ADAPTIVE_BANNER',
} as const;

const BannerAd = (_props: any) => null;

export {
  AdEventType,
  RewardedAdEventType,
  TestIds,
  RewardedAd,
  InterstitialAd,
  BannerAd,
  BannerAdSize,
};

export default function mobileAds() {
  return {
    setRequestConfiguration: async (_config?: any) => {},
    initialize: async () => {},
  };
}
