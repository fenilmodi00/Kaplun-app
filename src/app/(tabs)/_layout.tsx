import React from 'react';
import { View } from 'react-native';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { TabBar } from '@/components/tab-bar/TabBar';
import { useCSSVariable } from '@/tw';

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const canvas = (useCSSVariable('--color-background') as string) ?? '#000000';

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        tabBar={(props) => <TabBar {...props} />}
        // Android defaults this to true, which unmounts a tab when you leave it.
        // Insights then cold-starts (charts + Graph) on every tap — 2–3s even
        // with a warm React Query cache. Keep scenes mounted like Instagram.
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
        {/* Hidden: pushed from home avatar, not a tab button */}
        <Tabs.Screen name="(profile)" options={{ href: null }} />
      </Tabs>
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
