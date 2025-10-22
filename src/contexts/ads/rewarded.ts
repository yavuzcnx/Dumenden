// Geçici mock: paketsiz build için
export const initAds = () => {
  // no-op
};

export const showRewarded = async () => {
  // Reklam gösterilmedi, ödül kazanılmadı
  return { earned: false };
};

export const canShowRewarded = false;
