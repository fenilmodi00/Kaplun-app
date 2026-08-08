import { View, Pressable } from '@/tw';
import { SymbolIcon } from '@/components/symbol-icon';
import { EdgeBlur } from '@/components/edge-blur';
import { hapticSelection } from '@/lib/haptics';
import { useThemeColors } from '@/lib/theme';
import type { BottomTabBarProps } from "expo-router/js-tabs";
import { LiquidGlassView } from '@sbaiahmed1/react-native-blur';
import { useEffect, useRef } from 'react';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from '@/lib/reanimated-platform';
import { subscribeTabBarScroll } from '@/lib/tab-bar-scroll';

// ponytail: on web, withTiming returns target instantly and useAnimatedStyle evaluates once,
// so minimize is a static no-op. This is accepted — the animation only runs on native.

/** Approx pill height (padding + 44pt targets) for the bottom edge scrim. */
const PILL_HEIGHT = 60;

const TAB_NAMES: Record<string, 'home' | 'automate' | 'messages' | 'insights'> = {
  '(home)': 'home',
  '(automate)': 'automate',
  '(messages)': 'messages',
  '(insights)': 'insights',
};

const TABS = [
  { name: '(home)', label: 'Home' },
  { name: '(automate)', label: 'Automate' },
  { name: '(messages)', label: 'Messages' },
  { name: '(insights)', label: 'Insights' },
];

function TabButton({
  isFocused,
  tab,
  minimize,
  onPress,
}: {
  isFocused: boolean;
  tab: typeof TABS[number];
  minimize: ReturnType<typeof useSharedValue<number>>;
  onPress: () => void;
}) {
  const t = useThemeColors();
  const animatedStyle = useAnimatedStyle(() => {
    if (isFocused) {
      return { width: 48, opacity: 1 };
    }
    return {
      width: 48 * (1 - minimize.value),
      opacity: 1 - minimize.value,
    };
  });

  return (
    <Animated.View style={[{ overflow: 'hidden' }, animatedStyle]}>
      <Pressable
        className="items-center justify-center"
        style={{ width: 48, minHeight: 44 }}
        accessibilityRole="tab"
        accessibilityState={{ selected: isFocused }}
        accessibilityLabel={tab.label}
        onPress={onPress}
      >
        <SymbolIcon
          name={TAB_NAMES[tab.name]}
          active={isFocused}
          size={22}
          color={isFocused ? t.ink : t.mutedSoft}
        />
      </Pressable>
    </Animated.View>
  );
}

export function TabBar({ state, navigation, insets }: BottomTabBarProps) {
  const t = useThemeColors();
  const minimize = useSharedValue(0);
  const accumulator = useRef(0);

  useEffect(() => {
    const unsub = subscribeTabBarScroll((dy) => {
      accumulator.current += dy;
      if (accumulator.current > 8) {
        minimize.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.cubic) });
        accumulator.current = 0;
      } else if (accumulator.current < -8) {
        minimize.value = withTiming(0, { duration: 200, easing: Easing.out(Easing.cubic) });
        accumulator.current = 0;
      }
    });
    return unsub;
  }, [minimize]);

  useEffect(() => {
    minimize.value = withTiming(0, { duration: 200, easing: Easing.out(Easing.cubic) });
  }, [state.index, minimize]);

  // Focused flows nested inside a tab (the automation builder) render
  // full-screen with their own pinned CTA — the floating pill would sit on
  // top of it and swallow the taps, so the bar stays hidden there.
  const activeTab = state.routes[state.index];
  const nested = activeTab?.state;
  const nestedIndex = nested?.index ?? ((nested?.routes?.length ?? 1) - 1);
  const activeNestedRoute = nested?.routes?.[nestedIndex]?.name;
  if (activeNestedRoute === 'new') {
    return null;
  }

  return (
    <View
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        justifyContent: 'flex-end',
      }}
      pointerEvents="box-none"
    >
      {/*
        Cream gradient fade under the floating pill so scroll content softens
        into the canvas. Kept as EdgeBlur (LinearGradient) — not native blur —
        so remounting when the bar hides on `new` stays crash-safe.
      */}
      <EdgeBlur
        position="bottom"
        height={insets.bottom + 8 + PILL_HEIGHT}
        intensity={100}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}
      />
      <View
        className="border border-hairline"
        style={{
          alignSelf: 'center',
          marginBottom: insets.bottom + 8,
          borderRadius: 9999,
          boxShadow: '0 6px 20px rgba(10,10,10,0.08)',
        }}
      >
        <LiquidGlassView
          glassType="regular"
          glassTintColor={t.glassTint}
          glassOpacity={0.55}
          reducedTransparencyFallbackColor={t.glassTint}
          style={{ borderRadius: 9999 }}
        >
          <View className="flex-row" style={{ paddingVertical: 8, paddingHorizontal: 6 }}>
            {TABS.map((tab, index) => {
              const isFocused = state.index === index;
              return (
                <TabButton
                  key={tab.name}
                  isFocused={isFocused}
                  tab={tab}
                  minimize={minimize}
                  onPress={() => {
                    hapticSelection();
                    const event = navigation.emit({
                      type: 'tabPress',
                      target: state.routes[index].key,
                      canPreventDefault: true,
                    });
                    if (!isFocused && !event.defaultPrevented) {
                      navigation.navigate(tab.name);
                    }
                  }}
                />
              );
            })}
          </View>
        </LiquidGlassView>
      </View>
    </View>
  );
}

export default TabBar;
