import { View, Pressable } from '@/tw';
import { SymbolIcon } from '@/components/symbol-icon';
import { EdgeBlur } from '@/components/edge-blur';
import { hapticSelection } from '@/lib/haptics';
import { LinearGradient } from 'expo-linear-gradient';
import type { BottomTabBarProps } from "expo-router/js-tabs";
import { GlassSurface } from '@/components/ui/glass-surface';
import { useEffect, useRef } from 'react';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from '@/lib/reanimated-platform';
import { subscribeTabBarScroll } from '@/lib/tab-bar-scroll';

// ponytail: on web, withTiming returns target instantly and useAnimatedStyle evaluates once,
// so the pill stays at scale 1.1 (a static no-op). This is accepted — the animation only runs on native.

/** Approx pill height (padding + 44pt targets) at the 1.1x resting scale, for the bottom edge scrim. */
const PILL_HEIGHT = 66;

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

const ICON_LAYER = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  alignItems: 'center',
  justifyContent: 'center',
} as const;

function TabButton({
  isFocused,
  tab,
  onPress,
}: {
  isFocused: boolean;
  tab: typeof TABS[number];
  onPress: () => void;
}) {
  const focus = useSharedValue(isFocused ? 1 : 0);

  useEffect(() => {
    focus.value = withTiming(isFocused ? 1 : 0, {
      duration: 300,
      easing: Easing.out(Easing.cubic),
    });
  }, [isFocused, focus]);

  // Stacked muted/white glyph pairs scale+fade swap via `focus`.
  const activeIconStyle = useAnimatedStyle(() => ({
    opacity: focus.value,
    transform: [{ scale: focus.value }],
  }));
  const inactiveIconStyle = useAnimatedStyle(() => ({
    opacity: 1 - focus.value,
    transform: [{ scale: 1 - focus.value }],
  }));

  return (
    <Pressable
      className="items-center justify-center"
      style={{ width: 48, minHeight: 44 }}
      accessibilityRole="tab"
      accessibilityState={{ selected: isFocused }}
      accessibilityLabel={tab.label}
      onPress={onPress}
    >
      <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View style={[ICON_LAYER, inactiveIconStyle]}>
          <SymbolIcon
            name={TAB_NAMES[tab.name]}
            size={22}
            color="rgba(255,255,255,0.38)"
          />
        </Animated.View>
        <Animated.View style={[ICON_LAYER, activeIconStyle]}>
          <SymbolIcon
            name={TAB_NAMES[tab.name]}
            active
            size={22}
            color="#ffffff"
          />
        </Animated.View>
      </View>
    </Pressable>
  );
}

export function TabBar({ state, navigation, insets }: BottomTabBarProps) {
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

  // Instagram-style whole-pill scale: 1.1 at rest, 0.9 on scroll down, anchored
  // bottom-center so the pill sinks toward the bottom edge. All tabs stay visible.
  const scaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1.1 - minimize.value * 0.2 }],
    transformOrigin: '50% 100%',
  }));

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
      {/*
        Specular rim (1px padding): tiny metallic glints at the TL / BR
        corners only — mid-edge stays invisible, not a continuous fade.
      */}
      <Animated.View
        style={[
          { alignSelf: 'center', marginBottom: insets.bottom + 8 },
          scaleStyle,
        ]}
      >
        <LinearGradient
          colors={[
            'rgba(255,255,255,0.55)',
            'rgba(255,255,255,0.12)',
            'rgba(255,255,255,0)',
            'rgba(255,255,255,0)',
            'rgba(255,255,255,0.10)',
            'rgba(255,255,255,0.38)',
          ]}
          locations={[0, 0.1, 0.22, 0.78, 0.9, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            borderRadius: 9999,
            padding: 1,
            boxShadow: '0 14px 28px rgba(0,0,0,0.48), 0 3px 8px rgba(0,0,0,0.35)',
            elevation: 18,
          }}
        >
          <GlassSurface borderRadius={9999}>
            <View className="flex-row" style={{ paddingVertical: 8, paddingHorizontal: 6 }}>
              {TABS.map((tab, index) => {
                const isFocused = state.index === index;
                return (
                  <TabButton
                    key={tab.name}
                    isFocused={isFocused}
                    tab={tab}
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
          </GlassSurface>
        </LinearGradient>
      </Animated.View>
    </View>
  );
}

export default TabBar;
