/**
 * Native bottom sheet (iOS SwiftUI / Android Material3) with Kaplun theme defaults.
 * Wraps `@expo/ui/community/bottom-sheet` — do not import that module from screens.
 *
 * Visual model (like Cash App): solid sheet panel (AMOLED black in dark, cream in
 * light) + blurred, dimmed backdrop. The backdrop is plain RN rendered as a
 * sibling — children inside `Host` must be ExpoUI views, so RN views placed there
 * never show (RNHostView would be required; a sibling is simpler and identical).
 * Only `backgroundStyle.backgroundColor` reaches the native panel; custom
 * `backgroundComponent`/`backdropComponent` are no-ops on native.
 *
 * Platform limits: modal overlay only (no persistent peek); Android ≤2 snap states.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';
import { Host } from '@expo/ui';
import ExpoBottomSheet, {
  BottomSheetModal as ExpoBottomSheetModal,
  BottomSheetView,
  BottomSheetScrollView,
  BottomSheetFlatList,
  BottomSheetSectionList,
  BottomSheetTextInput,
  BottomSheetModalProvider,
  useBottomSheet,
} from '@expo/ui/community/bottom-sheet';
import type {
  BottomSheetProps as ExpoBottomSheetProps,
  BottomSheetMethods,
  BottomSheetViewProps,
  BottomSheetHandleProps,
  BottomSheetBackdropProps,
  BottomSheetBackgroundProps,
  BottomSheetFooterProps,
} from '@expo/ui/community/bottom-sheet';
import { useThemeColors } from '@/lib/theme';
import { useThemeMode } from 'panelui-native';
import { hapticImpactLight } from '@/lib/haptics';
import {
  BottomSheetBackdrop,
  SHEET_CLOSE_MS,
  SHEET_CONTENT_OPEN_DELAY_MS,
  SHEET_OPEN_MS,
} from './backdrop';
import { BottomSheetHeader } from './header';

export type BottomSheetProps = ExpoBottomSheetProps & {
  testID?: string;
};

export type { BottomSheetMethods, BottomSheetViewProps };
export type {
  BottomSheetHandleProps,
  BottomSheetBackdropProps,
  BottomSheetBackgroundProps,
  BottomSheetFooterProps,
};
export {
  BottomSheetView,
  BottomSheetScrollView,
  BottomSheetFlatList,
  BottomSheetSectionList,
  BottomSheetTextInput,
  BottomSheetModalProvider,
  useBottomSheet,
};
export { BottomSheetHeader };
export type { BottomSheetHeaderProps } from './header';

function useSheetBackgroundStyle(backgroundStyle?: ExpoBottomSheetProps['backgroundStyle']) {
  const colors = useThemeColors();
  return useMemo(
    () => StyleSheet.flatten([{ backgroundColor: colors.canvas }, backgroundStyle]),
    [colors.canvas, backgroundStyle],
  );
}

function useSheetOpenState(
  onChange?: ExpoBottomSheetProps['onChange'],
  initiallyOpen = false,
) {
  const openedRef = useRef(initiallyOpen);
  const [isOpen, setIsOpen] = useState(initiallyOpen);

  const handleChange = useCallback(
    (index: number) => {
      const nextOpen = index >= 0;
      setIsOpen(nextOpen);
      if (nextOpen && !openedRef.current) {
        openedRef.current = true;
        hapticImpactLight();
      }
      if (index === -1) {
        openedRef.current = false;
      }
      onChange?.(index);
    },
    [onChange],
  );

  return { isOpen, handleChange };
}

function ThemedBottomSheet({
  Component,
  enablePanDownToClose = true,
  backgroundStyle,
  onChange,
  index,
  children,
  ...rest
}: BottomSheetProps & {
  Component: typeof ExpoBottomSheet | typeof ExpoBottomSheetModal;
}) {
  const { mode: scheme } = useThemeMode();
  const mergedBackground = useSheetBackgroundStyle(backgroundStyle);
  const defaultIndex = Component === ExpoBottomSheetModal ? -1 : 0;
  const { isOpen, handleChange } = useSheetOpenState(onChange, (index ?? defaultIndex) >= 0);

  const contentOpacity = useRef(new Animated.Value(isOpen ? 1 : 0)).current;

  useEffect(() => {
    if (isOpen) {
      Animated.sequence([
        Animated.delay(SHEET_CONTENT_OPEN_DELAY_MS),
        Animated.timing(contentOpacity, {
          toValue: 1,
          duration: SHEET_OPEN_MS - SHEET_CONTENT_OPEN_DELAY_MS,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.timing(contentOpacity, {
        toValue: 0,
        duration: SHEET_CLOSE_MS,
        easing: Easing.in(Easing.ease),
        useNativeDriver: true,
      }).start();
    }
  }, [isOpen, contentOpacity]);

  return (
    <>
      <BottomSheetBackdrop visible={isOpen} />
      <Host matchContents colorScheme={scheme}>
        <Component
          enablePanDownToClose={enablePanDownToClose}
          backgroundStyle={mergedBackground}
          onChange={handleChange}
          index={index}
          {...rest}>
          <Animated.View style={{ opacity: contentOpacity }}>{children}</Animated.View>
        </Component>
      </Host>
    </>
  );
}

export function BottomSheet(props: BottomSheetProps) {
  return <ThemedBottomSheet Component={ExpoBottomSheet} {...props} />;
}

export function BottomSheetModal(props: BottomSheetProps) {
  return <ThemedBottomSheet Component={ExpoBottomSheetModal} {...props} />;
}

export default BottomSheet;
