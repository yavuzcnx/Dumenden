import { Linking, Platform } from 'react-native';

let _asked = false;

export type AttStatus = 'unavailable' | 'undetermined' | 'denied' | 'authorized' | 'restricted';

const toStatus = (status: any): AttStatus => {
  const s = String(status);
  if (s === 'authorized' || s === 'granted') return 'authorized';
  if (s === 'denied') return 'denied';
  if (s === 'restricted') return 'restricted';
  if (s === 'unavailable') return 'unavailable';
  return 'undetermined';
};

export async function getATTStatus(): Promise<AttStatus> {
  if (Platform.OS !== 'ios') return 'unavailable';
  try {
    const tt = await import('expo-tracking-transparency');
    const { status } = await tt.getTrackingPermissionsAsync();
    return toStatus(status);
  } catch (e) {
    console.warn('[ATT] status check failed', e);
    return 'unavailable';
  }
}

export async function requestATT(): Promise<AttStatus> {
  if (Platform.OS !== 'ios') return 'unavailable';
  try {
    const tt = await import('expo-tracking-transparency');
    const { status } = await tt.getTrackingPermissionsAsync();
    if (
      status === tt.PermissionStatus.UNDETERMINED ||
      status === 'undetermined' ||
      status === 'not-determined'
    ) {
      const res = await tt.requestTrackingPermissionsAsync();
      return toStatus(res.status);
    }
    return toStatus(status);
  } catch (e) {
    console.warn('[ATT] request failed', e);
    return 'unavailable';
  }
}

export async function requestATTOnce() {
  if (_asked || Platform.OS !== 'ios') return 'unavailable';
  _asked = true;
  try {
    return await requestATT();
  } catch (e) {
    console.warn('[ATT] request failed', e);
  }
  return 'unavailable';
}

export async function openATTSettings() {
  try {
    await Linking.openSettings();
  } catch (e) {
    console.warn('[ATT] open settings failed', e);
  }
}
