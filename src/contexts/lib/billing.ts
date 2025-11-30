import { supabase } from '@/lib/supabaseClient';
import { Alert, Platform } from 'react-native'; // Alert eklendi
import * as RNIap from 'react-native-iap';

// 🔥 YENİ ID'LER
export const PRODUCT_ID = 'dumenden_plus_v1';
export const PLAN_ID = 'monthly-plan-v1'; 

let iapReady = false;
let purchaseUpdateSub: any = null;
let purchaseErrorSub: any = null;

export type NormalizedSub = {
  id: string | undefined;
  displayPrice: string | null;
  offerToken: string | null;
  basePlanId: string | null;
  raw: any;
};

export async function connectBilling() {
  if (iapReady) return;

  try {
    console.log('[IAP] initConnection...');
    await (RNIap.initConnection as any)();

    // Pending purchase temizliği (Android)
    try {
      const flush = (RNIap as any).flushFailedPurchasesCachedAsPendingAndroid;
      if (Platform.OS === 'android' && typeof flush === 'function') {
        await flush();
      }
    } catch (e) {
      console.warn('[IAP] flushFailedPurchasesCachedAsPendingAndroid error', e);
    }

    const onUpdate = async (purchase: any) => {
      try {
        const pid =
          purchase?.productId ??
          (Array.isArray((purchase as any).productIds)
            ? (purchase as any).productIds[0]
            : undefined);

        console.log('[IAP] purchase update', pid);

        if (pid === PRODUCT_ID) {
          await supabase.rpc('upsert_purchase', {
            p_platform: Platform.OS,
            p_product_id: PRODUCT_ID,
            p_plan_id: PLAN_ID,
            p_order_id: (purchase as any).orderId ?? null,
            p_purchase_token: (purchase as any).purchaseToken ?? null,
            p_acknowledged: true,
            p_auto_renewing: (purchase as any).autoRenewing ?? null,
            p_status: 'ACTIVE',
            p_raw: purchase as any,
          });
          
          // Başarılı satın alımda ufak bir bilgi verelim
          Alert.alert('Başarılı', 'Premium üyeliğiniz aktif edildi! 🎉');
        }

        try {
          const api: any = RNIap as any;
          if (typeof api.finishTransaction === 'function') {
            if (api.finishTransaction.length === 1) {
              await api.finishTransaction({ purchase, isConsumable: false });
            } else {
              await api.finishTransaction(purchase, false);
            }
          }
        } catch (e) {
          console.warn('[IAP] finishTransaction error', e);
        }
      } catch (e) {
        console.warn('[IAP] purchase handle error', e);
        Alert.alert('Hata', 'Satın alma işlemi işlenirken bir sorun oluştu.');
      }
    };

    const onError = (err: any) => {
      console.warn('[IAP] purchase error', err);
      // Kullanıcı iptal ettiyse hata basmaya gerek yok
      if (err?.responseCode !== 'USER_CANCELED' && err?.code !== 'E_USER_CANCELLED') {
         Alert.alert('Satın Alma Başarısız', 'İşlem tamamlanamadı. Lütfen tekrar deneyin.');
      }
    };

    const api: any = RNIap as any;
    const pul = api.purchaseUpdatedListener;
    const pel = api.purchaseErrorListener;

    if (typeof pul === 'function') purchaseUpdateSub = pul(onUpdate);
    if (typeof pel === 'function') purchaseErrorSub = pel(onError);

    iapReady = true;
  } catch (e: any) {
    console.warn('[IAP] initConnection failed', e);
    Alert.alert('Bağlantı Hatası', 'Google Play Store bağlantısı kurulamadı: ' + (e.message || 'Bilinmeyen hata'));
  }
}

export async function disconnectBilling() {
  try {
    if (purchaseUpdateSub?.remove) purchaseUpdateSub.remove();
  } catch {}
  try {
    if (purchaseErrorSub?.remove) purchaseErrorSub.remove();
  } catch {}

  purchaseUpdateSub = null;
  purchaseErrorSub = null;

  try {
    await (RNIap.endConnection as any)();
  } catch {}

  iapReady = false;
}

/**
 * Play Store/App Store’dan abonelik ürününü çeker.
 */
export async function loadProducts(): Promise<NormalizedSub[]> {
  try {
    await connectBilling();
    const api: any = RNIap as any;

    let subs: any[] = [];

    // 1) getSubscriptions([id]) dene (Abonelikler için ana yöntem)
    if (typeof api.getSubscriptions === 'function') {
      try {
        console.log('[IAP] getSubscriptions([id]) çağrılıyor...');
        subs = await api.getSubscriptions([PRODUCT_ID]);
      } catch (e1) {
        console.warn('[IAP] getSubscriptions([id]) hata', e1);
        try {
          console.log('[IAP] getSubscriptions({ skus:[id] }) fallback...');
          subs = await api.getSubscriptions({ skus: [PRODUCT_ID] });
        } catch (e2) {
          console.warn('[IAP] getSubscriptions({skus}) hata', e2);
        }
      }
    }

    // 2) Hâlâ boşsa getProducts ile dene (bazı cihazlarda/eski IAP sürümlerinde veya iOS'ta)
    if ((!subs || subs.length === 0) && typeof api.getProducts === 'function') {
      try {
        console.log('[IAP] getProducts([id]) fallback...');
        subs = await api.getProducts([PRODUCT_ID]);
      } catch (e3) {
        console.warn('[IAP] getProducts([id]) hata', e3);
        try {
          console.log('[IAP] getProducts({ skus:[id] }) fallback2...');
          subs = await api.getProducts({ skus: [PRODUCT_ID] });
        } catch (e4) {
          console.warn('[IAP] getProducts({skus}) hata', e4);
        }
      }
    }

    console.log('[IAP] subs raw ->', JSON.stringify(subs, null, 2));

    if (!subs || subs.length === 0) {
      return [];
    }

    // Yeni RNIap yapısı için ayrıştırmayı güçlendiriyoruz.
    return subs.map((p) => {
      // Abonelikler için PLAN_ID'nizle eşleşen offer'ı bulmaya çalışıyoruz
      const offerDetails = p?.subscriptionOfferDetails ?? [];

      // Doğru BasePlan ID'ye (monthly-plan) sahip teklifi bul (Android için)
      const targetOffer = offerDetails.find(d => d.basePlanId === PLAN_ID) ?? offerDetails[0] ?? null;
      
      const offerToken = targetOffer?.offerToken ?? null;
      const basePlanId = targetOffer?.basePlanId ?? null;
      
      // Fiyat bilgisi genellikle ilk pricingPhase'de olur
      const pricingPhase = targetOffer?.pricingPhases?.pricingPhaseList?.[0] ?? null;

      // Fiyatı belirleme (Öncelik: Yeni abonelik fiyatı, sonra eski/iOS fiyatları)
      const displayPrice = 
        pricingPhase?.formattedPrice ?? // Yeni abonelik fiyatı (Android için en güvenilir)
        p?.localizedPrice ?? // Eski RNIap yapısı veya iOS/tek seferlik
        p?.price ?? 
        null;

      return {
        id: p?.productId ?? p?.sku,
        displayPrice,
        offerToken, // Satın alma için offerToken'ı doğru iletiyoruz
        basePlanId, // Satın alma için basePlanId'yi doğru iletiyoruz
        raw: p,
      } as NormalizedSub;
    });
  } catch (e) {
    console.warn('[IAP] loadProducts error', e);
    return [];
  }
}

export async function buyPremium() {
  // 1. Bağlantı kontrolü
  try {
    await connectBilling();
  } catch (e: any) {
    Alert.alert("Bağlantı Hatası", "Store bağlantısı kurulamadı: " + e.message);
    return;
  }

  const api: any = RNIap as any;

  // 2. Ürünleri yükle ve kontrol et
  const products = await loadProducts();
  
  if (!products || products.length === 0) {
    Alert.alert(
        "Ürün Bulunamadı", 
        "Google Play'den abonelik bilgisi çekilemedi.\nLütfen internet bağlantınızı ve Play Store hesabınızı kontrol edin."
    );
    return;
  }

  const first = products?.[0];
  
  // Android için offerToken ve BasePlanId kullanılıyor
  const offerToken = first?.offerToken ?? null;
  const basePlanId = first?.basePlanId ?? null;

  console.log('[IAP] buyPremium, first product:', first);

  // requestSubscription çağrısı.
  if (typeof api.requestSubscription === 'function') {
    try {
      if (offerToken && basePlanId) {
        // Yeni ve önerilen Android IAP v4+ yöntemi (offerToken ile)
        await api.requestSubscription({
          sku: PRODUCT_ID,
          subscriptionOffers: [{ 
            sku: PRODUCT_ID,
            offerToken,
            subscriptionId: PRODUCT_ID,
            basePlanId,
          }],
        });
      } else {
        // OfferToken yoksa uyaralım (Test için önemli)
        if (Platform.OS === 'android') {
             console.warn("Uyarı: OfferToken bulunamadı, eski yöntem deneniyor.");
        }

        // iOS veya offerToken alınamayan eski/düşük cihazlar için fallback
        try {
          await api.requestSubscription({ sku: PRODUCT_ID });
        } catch {
          await api.requestSubscription(PRODUCT_ID);
        }
      }
      return;
    } catch (e: any) {
      console.warn('[IAP] requestSubscription error', e);
      Alert.alert("Satın Alma Hatası", "İşlem başlatılamadı: " + (e.message || "Bilinmeyen hata"));
    }
  }

  // Hala çalışmazsa, eski requestPurchase fallback'ini deniyoruz
  if (typeof api.requestPurchase === 'function') {
    try {
      await api.requestPurchase(PRODUCT_ID, false);
    } catch (e: any) {
      console.warn('[IAP] requestPurchase fallback error', e);
      Alert.alert("Hata", "Satın alma isteği gönderilemedi.");
    }
  }
}

export async function restorePremium() {
  await connectBilling();
  try {
    const api: any = RNIap as any;
    const purchases =
      typeof api.getAvailablePurchases === 'function'
        ? await api.getAvailablePurchases()
        : [];

    console.log('[IAP] restore purchases ->', purchases);

    if (purchases.length === 0) {
        Alert.alert("Bilgi", "Geri yüklenecek aktif bir abonelik bulunamadı.");
        return;
    }

    for (const p of purchases) {
      const pid =
        p?.productId ??
        (Array.isArray((p as any).productIds)
          ? (p as any).productIds[0]
          : undefined);

      if (pid === PRODUCT_ID) {
        await supabase.rpc('upsert_purchase', {
          p_platform: Platform.OS,
          p_product_id: PRODUCT_ID,
          p_plan_id: PLAN_ID,
          p_order_id: (p as any).orderId ?? null,
          p_purchase_token: (p as any).purchaseToken ?? null,
          p_acknowledged: true,
          p_auto_renewing: (p as any).autoRenewing ?? null,
          p_status: 'ACTIVE',
          p_raw: p as any,
        });
      }
    }
    Alert.alert("Başarılı", "Satın alımlarınız geri yüklendi.");
  } catch (e) {
    console.warn('[IAP] restore error', e);
    Alert.alert("Hata", "Geri yükleme sırasında bir sorun oluştu.");
  }
}