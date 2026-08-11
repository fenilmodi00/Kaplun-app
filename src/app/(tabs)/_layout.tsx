import React from 'react';
import { View } from 'react-native';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TabBar } from '@/components/clay/TabBar';
import { EdgeBlur } from '@/components/edge-blur';

export default function TabsLayout() {
  const insets = useSafeAreaInsets();

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
      <EdgeBlur
        position="top"
        height={insets.top + 40}
        style={{ position: 'absolute', top: 0, left: 0, right: 0 }}
      />
    </View>
  );
}
