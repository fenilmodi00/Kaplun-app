import React, { useCallback } from 'react';
import { View } from 'react-native';
import { Tabs, useSegments, useRouter } from 'expo-router';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { runOnJS } from '@/lib/reanimated-platform';
import { useCSSVariable } from '@/tw';
import { TabBar } from '@/components/tab-bar/TabBar';

const TAB_ROUTES = ['(home)', '(automate)', '(messages)', '(insights)'];

export default function TabsLayout() {
  const router = useRouter();
  const segments = useSegments() as string[];
  const insets = useSafeAreaInsets();
  const canvas = (useCSSVariable('--color-background') as string) ?? '#000000';

  // Current tab index from URL segments.
  const tabSegment = segments[1] ?? '(home)';
  const activeIndex = TAB_ROUTES.indexOf(tabSegment);

  // Hide tab bar when nested 'new' route is active.
  const hidden = segments.includes('new');

  const navigateTab = useCallback(
    (direction: -1 | 1) => {
      const nextIndex = activeIndex + direction;
      if (nextIndex < 0 || nextIndex >= TAB_ROUTES.length) return;
      router.replace(`/(tabs)/${TAB_ROUTES[nextIndex]}` as never);
    },
    [activeIndex, router],
  );

  const panGesture = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .onEnd((event) => {
      if (event.translationX < -50) {
        runOnJS(navigateTab)(1);
      } else if (event.translationX > 50) {
        runOnJS(navigateTab)(-1);
      }
    });

  return (
    <View style={{ flex: 1 }}>
      <GestureDetector gesture={panGesture}>
        <View style={{ flex: 1 }}>
          <Tabs
            tabBar={(props) => (
              <TabBar
                {...props}
                hidden={hidden}
              />
            )}
            detachInactiveScreens={false}
            screenOptions={{
              headerShown: false,
              tabBarShowLabel: false,
            }}
          >
            <Tabs.Screen name="(home)" options={{ title: 'Home' }} />
            <Tabs.Screen name="(automate)" options={{ title: 'Automate' }} />
            <Tabs.Screen name="(messages)" options={{ title: 'Messages' }} />
            <Tabs.Screen name="(insights)" options={{ title: 'Insights' }} />
            <Tabs.Screen name="(profile)" options={{ href: null }} />
          </Tabs>
        </View>
      </GestureDetector>
      <LinearGradient
        colors={[`${canvas}EB`, `${canvas}00`]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top + 40 }}
        pointerEvents="none"
      />
    </View>
  );
}