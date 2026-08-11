import { Platform } from 'react-native';
import type { RefObject } from 'react';
import type { View as RNView } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';

/**
 * Captures the hidden ShareCard view as a 1080x1920 PNG and opens the OS
 * share sheet. Throws Error('share_unavailable') where sharing cannot run
 * (web, or no share target); any capture failure bubbles up as-is.
 */
export async function shareScoreCard(cardRef: RefObject<RNView | null>): Promise<void> {
  if (Platform.OS === 'web') {
    throw new Error('share_unavailable');
  }
  const uri = await captureRef(cardRef, {
    format: 'png',
    quality: 1,
    width: 1080,
    height: 1920,
    result: 'tmpfile',
  });
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('share_unavailable');
  }
  await Sharing.shareAsync(uri, {
    mimeType: 'image/png',
    dialogTitle: 'Share your Kaplun score',
    UTI: 'public.png',
  });
}
