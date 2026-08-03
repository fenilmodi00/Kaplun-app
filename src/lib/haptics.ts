import * as Haptics from 'expo-haptics';

const IS_IOS = process.env.EXPO_OS === 'ios';

export function hapticSelection(): void {
  if (!IS_IOS) return;
  Haptics.selectionAsync().catch(() => {});
}

export function hapticImpactLight(): void {
  if (!IS_IOS) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}
