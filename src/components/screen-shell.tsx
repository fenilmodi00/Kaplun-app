import type { ReactNode } from 'react';
import { useRef } from 'react';
import type { NativeScrollEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScrollView } from '@/tw';
import { reportTabBarScroll } from '@/lib/tab-bar-scroll';

/**
 * Scroll-content bottom padding — ensures the last item clears the tab bar.
 * Copied from the verified-good home screen (src/app/(tabs)/(home)/index.tsx:448,486).
 */
export const TAB_BAR_CLEARANCE = 110;

/**
 * Clearance for FIXED bottom elements (input bars, action rows).
 * Measured tab-bar height ~66px (container paddingVertical 8×2 + ~50px tab content),
 * + 8px bottom offset, + ~10px gap.
 */
export const TAB_BAR_OVERLAY = 84;

/**
 * Returns safe-area-aware padding values for scroll content.
 * Uses the same formula as the verified-good home screen.
 */
export function useScreenContentPadding(): {
  paddingTop: number;
  paddingBottom: number;
  paddingHorizontal: number;
} {
  const insets = useSafeAreaInsets();
  return {
    paddingTop: insets.top + 12,
    paddingBottom: insets.bottom + TAB_BAR_CLEARANCE,
    paddingHorizontal: 18,
  };
}

interface ScreenShellProps {
  children: ReactNode;
  /** When true, centers content vertically (flexGrow + justifyContent center). */
  center?: boolean;
  /** Additional content container style (later overrides win). */
  contentContainerStyle?: Record<string, unknown>;
  testID?: string;
}

/**
 * Standard scrollable screen shell for tab screens.
 *
 * `contentInsetAdjustmentBehavior="automatic"` is kept for consistency with the
 * verified-good home screen; in this app's configuration (all stack headers
 * hidden, custom absolute tab bar) it does not add inset beyond what
 * useSafeAreaInsets provides — F3 manual QA explicitly verifies no double top
 * padding on a notched device.
 */
export function ScreenShell({
  children,
  center,
  contentContainerStyle,
  testID,
}: ScreenShellProps): React.ReactElement {
  const padding = useScreenContentPadding();
  const lastY = useRef(0);

  return (
    <ScrollView
      className="flex-1 bg-canvas"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={[
        padding,
        center && { flexGrow: 1, justifyContent: 'center' },
        contentContainerStyle,
      ]}
      testID={testID}
      scrollEventThrottle={16}
      onScroll={(e: { nativeEvent: NativeScrollEvent }) => {
        const y = e.nativeEvent.contentOffset.y;
        const dy = y - lastY.current;
        lastY.current = y;
        reportTabBarScroll(dy);
      }}
    >
      {children}
    </ScrollView>
  );
}
