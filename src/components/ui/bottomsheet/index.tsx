/**
 * Bottom sheet rebuilt on react-native-gesture-handler + Reanimated.
 * Drops the @expo/ui dependency — the sheet mechanics (drag, snap, presentation)
 * are now handled by Gesture.Pan + useSharedValue/useAnimatedStyle.
 *
 * Visual model (like Cash App): solid sheet panel (AMOLED black in dark, cream
 * in light) + blurred, dimmed backdrop. The backdrop is a plain RN sibling
 * inside the Modal — no @expo/ui Host wrapper needed.
 *
 * Platform limits: modal overlay only (no persistent peek); Android ≤2 snap states.
 */
import React, { forwardRef, useCallback, useImperativeHandle, useMemo, useState } from 'react';
import { Modal, useWindowDimensions, type ViewProps } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  Easing,
  Reanimated,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from '@/lib/reanimated-platform';
import { View, useCSSVariable } from '@/tw';
import { hapticImpactLight } from '@/lib/haptics';
import { BottomSheetBackdrop, SHEET_CLOSE_MS, SHEET_OPEN_MS } from './backdrop';
import { BottomSheetHeader } from './header';

export interface BottomSheetMethods {
  present(): void;
  dismiss(): void;
}

export interface BottomSheetProps {
  snapPoints?: string[];
  enablePanDownToClose?: boolean;
  onChange?: (index: number) => void;
  children?: React.ReactNode;
  backgroundStyle?: ViewProps['style'];
  index?: number;
  testID?: string;
}

export type BottomSheetViewProps = ViewProps;

/** Simple wrapper — replaces @expo/ui's BottomSheetView. */
export function BottomSheetView(props: BottomSheetViewProps) {
  return <View {...props} />;
}

function parseSnapPoint(snap: string, screenHeight: number): number {
  if (snap.endsWith('%')) {
    return (parseFloat(snap) / 100) * screenHeight;
  }
  return parseFloat(snap);
}

/**
 * Imperative modal bottom sheet on gesture-handler + Reanimated.
 * Use `ref.current?.present()` / `ref.current?.dismiss()`.
 */
export const BottomSheetModal = forwardRef<BottomSheetMethods, BottomSheetProps>(
  function BottomSheetModal(
    {
      snapPoints = ['50%'],
      enablePanDownToClose = true,
      onChange,
      children,
      backgroundStyle,
      testID,
    },
    ref,
  ) {
    const [visible, setVisible] = useState(false);
    const [closing, setClosing] = useState(false);
    const { height: screenHeight } = useWindowDimensions();
    const translateY = useSharedValue(screenHeight);

    const snapHeights = useMemo(
      () => snapPoints.map((sp) => parseSnapPoint(sp, screenHeight)),
      [snapPoints, screenHeight],
    );
    const sheetHeight = Math.max(...snapHeights);
    const backgroundColor = useCSSVariable('--color-background') as string;

    const present = useCallback(() => {
      setVisible(true);
      setClosing(false);
      translateY.value = withTiming(0, { duration: SHEET_OPEN_MS, easing: Easing.out(Easing.ease) });
      hapticImpactLight();
      onChange?.(0);
    }, [translateY, onChange]);

    const dismiss = useCallback(() => {
      if (!visible) return;
      setClosing(true);
      translateY.value = withTiming(
        sheetHeight,
        { duration: SHEET_CLOSE_MS, easing: Easing.in(Easing.ease) },
        (finished) => {
          if (finished) {
            runOnJS(setVisible)(false);
            runOnJS(setClosing)(false);
          }
        },
      );
      onChange?.(-1);
    }, [visible, translateY, sheetHeight, onChange]);

    useImperativeHandle(ref, () => ({ present, dismiss }), [present, dismiss]);

    const panGesture = useMemo(
      () =>
        Gesture.Pan()
          .onUpdate((e) => {
            translateY.value = Math.max(0, e.translationY);
          })
          .onEnd((e) => {
            if (
              enablePanDownToClose &&
              (e.translationY > sheetHeight * 0.3 || e.velocityY > 500)
            ) {
              runOnJS(dismiss)();
            } else {
              translateY.value = withSpring(0);
            }
          }),
      [enablePanDownToClose, sheetHeight, translateY, dismiss],
    );

    const sheetAnimStyle = useAnimatedStyle(() => ({
      transform: [{ translateY: translateY.value }],
    }));

    return (
      <Modal
        transparent
        visible={visible || closing}
        animationType="none"
        onRequestClose={dismiss}
        testID={testID}
      >
        <GestureHandlerRootView style={{ flex: 1 }}>
          <BottomSheetBackdrop visible={visible && !closing} />
          <GestureDetector gesture={panGesture}>
            <Reanimated.View
              style={[
                {
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  height: sheetHeight,
                  backgroundColor,
                  borderTopLeftRadius: 24,
                  borderTopRightRadius: 24,
                },
                sheetAnimStyle,
                backgroundStyle,
              ]}
            >
              <View className="items-center pt-3 pb-1">
                <View className="h-1.5 w-10 rounded-full bg-muted-foreground/30" />
              </View>
              {children}
            </Reanimated.View>
          </GestureDetector>
        </GestureHandlerRootView>
      </Modal>
    );
  },
);

export { BottomSheetHeader };
export type { BottomSheetHeaderProps } from './header';
