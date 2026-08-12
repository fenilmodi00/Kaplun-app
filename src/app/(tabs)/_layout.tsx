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
        screenOptions={{
          headerShown: false,
          tabBarShowLabel: false,
        }}
      >
        <Tabs.Screen name="(home)" options={{ title: 'Home' }} />
        <Tabs.Screen name="(automate)" options={{ title: 'Automate' }} />
        <Tabs.Screen name="(messages)" options={{ title: 'Messages' }} />
        <Tabs.Screen name="(insights)" options={{ title: 'Insights' }} />
        <Tabs.Screen name="(score)" options={{ title: 'Score' }} />
      </Tabs>
      <LinearGradient
        colors={[`${canvas}00`, `${canvas}EB`]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top + 40 }}
        pointerEvents="none"
      />
    </View>
  );
}
