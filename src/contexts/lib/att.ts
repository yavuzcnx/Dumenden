import { Platform } from 'react-native';

let _asked = false;

export async function requestATTOnce() {
  if (_asked || Platform.OS !== 'ios') return;
  _asked = true;
  try {
    const tt = await import('expo-tracking-transparency');
    const { status } = await tt.getTrackingPermissionsAsync();
    if (status === tt.PermissionStatus.UNDETERMINED) {
      await tt.requestTrackingPermissionsAsync();
    }
  } catch (e) {
    console.warn('[ATT] request failed', e);
  }
}
