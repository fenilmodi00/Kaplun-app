import { Platform } from 'react-native';
import { View, Pressable, useCSSVariable } from '@/tw';
import { SymbolIcon, type SymbolName } from '@/components/symbol-icon';
import { hapticSelection } from '@/lib/haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView, LiquidGlassView } from '@sbaiahmed1/react-native-blur';
import type { BottomTabBarProps } from "expo-router/js-tabs";
import { useEffect, useRef } from 'react';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from '@/lib/reanimated-platform';
import { subscribeTabBarScroll } from '@/lib/tab-bar-scroll';

const HAS_NATIVE_GLASS =
  Platform.OS === 'ios' &&
  Number.parseInt(String(Platform.Version), 10) >= 26;

// ponytail: on web, withTiming returns target instantly and useAnimatedStyle evaluates once,
// so the pill stays at scale REST_SCALE (a static no-op). This is accepted — the animation only runs on native.

/** Resting whole-pill scale (5% under the old 1.1); minimized stays 0.9. */
const REST_SCALE = 1.035;
const MIN_SCALE = 0.9;

/** Approx pill height (padding + 44pt targets) at REST_SCALE, for the bottom edge scrim. */
const PILL_HEIGHT = 73;

const TAB_NAMES: Record<string, SymbolName> = {
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
      className="w-12 min-h-11 items-center justify-center"
      accessibilityRole="tab"
      accessibilityState={{ selected: isFocused }}
      accessibilityLabel={tab.label}
      onPress={onPress}
    >
      <View className="w-6 h-6 items-center justify-center">
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
  const canvas = (useCSSVariable('--color-background') as string) ?? '#000000';

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

  // After Home's first paint, mount Insights off-screen so the first tap is a
  // visibility switch — not a JS parse of BarChart + a Graph round-trip.
  useEffect(() => {
    navigation.preload('(insights)');
  }, [navigation]);

  // Instagram-style whole-pill scale: REST_SCALE at rest, MIN_SCALE on scroll down,
  // anchored bottom-center so the pill sinks toward the bottom edge. All tabs stay visible.
  const scaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: REST_SCALE - minimize.value * (REST_SCALE - MIN_SCALE) }],
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
      className="absolute inset-0 justify-end"
      pointerEvents="box-none"
    >
      {/*
        Cream gradient fade under the floating pill so scroll content softens
        into the canvas. LinearGradient — not native blur — so remounting
        when the bar hides on `new` stays crash-safe.
      */}
      <LinearGradient
        colors={[`${canvas}00`, `${canvas}73`, `${canvas}EB`]}
        locations={[0, 0.6, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: insets.bottom + 8 + PILL_HEIGHT }}
        pointerEvents="none"
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
          {HAS_NATIVE_GLASS ? (
            <LiquidGlassView
              glassType="clear"
              glassTintColor="clear"
              reducedTransparencyFallbackColor="#151517"
              style={{ borderRadius: 9999, overflow: 'hidden' }}
            >
              <View className="flex-row py-2 px-1.5">
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
            </LiquidGlassView>
          ) : (
            <BlurView
              blurType="extraDark"
              blurAmount={10}
              reducedTransparencyFallbackColor="#151517"
              style={{ borderRadius: 9999, overflow: 'hidden' }}
            >
              <View className="flex-row py-2 px-1.5">
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
            </BlurView>
          )}
        </LinearGradient>
      </Animated.View>
    </View>
  );
}

export default TabBar;
