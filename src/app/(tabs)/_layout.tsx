import React, { useRef } from 'react';
import { View, type View as RNView } from 'react-native';
import { Tabs } from 'expo-router';
import { BlurTargetView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ClayTabBar } from '@/components/clay/ClayTabBar';
import { EdgeBlur } from '@/components/edge-blur';

export default function TabsLayout() {
  const blurTargetRef = useRef<RNView | null>(null);
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1 }}>
      <BlurTargetView ref={blurTargetRef} style={{ flex: 1 }}>
        <Tabs
          tabBar={(props) => <ClayTabBar {...props} blurTarget={blurTargetRef} />}
          screenOptions={{
            headerShown: false,
            tabBarShowLabel: false,
          }}
        >
          <Tabs.Screen name="(home)" options={{ title: 'Home' }} />
          <Tabs.Screen name="(automate)" options={{ title: 'Automate' }} />
          <Tabs.Screen name="(messages)" options={{ title: 'Messages' }} />
          <Tabs.Screen name="(publish)" options={{ title: 'Publish' }} />
          <Tabs.Screen name="(insights)" options={{ title: 'Insights' }} />
          <Tabs.Screen name="(profile)" options={{ title: 'Profile' }} />
        </Tabs>
      </BlurTargetView>
      {/* Rendered AFTER BlurTargetView so the blur sees dynamic content. */}
      <EdgeBlur
        position="top"
        height={insets.top + 40}
        blurTarget={blurTargetRef}
        style={{ position: 'absolute', top: 0, left: 0, right: 0 }}
      />
    </View>
  );
}
