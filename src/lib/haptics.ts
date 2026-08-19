import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

export function hapticSelection(): void {
  Haptics.selectionAsync().catch(() => {});
}

export function hapticImpactLight(): void {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

/** Short crisp click — selection tick on iOS, native context-click on Android. */
export function hapticClick(): void {
  if (Platform.OS === 'android') {
    Haptics.performAndroidHapticsAsync(
      Haptics.AndroidHaptics.Context_Click,
    ).catch(() => {});
  } else {
    Haptics.selectionAsync().catch(() => {});
  }
}
