import React, { useLayoutEffect, useRef } from 'react';
import { View } from 'react-native';
import { Tabs, useRouter, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TabBar } from '@/components/clay/TabBar';
import { EdgeBlur } from '@/components/edge-blur';

export const unstable_settings = {
  anchor: '(home)',
};

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const initialChecked = useRef(false);

  useLayoutEffect(() => {
    if (initialChecked.current) return;
    initialChecked.current = true;
    if (pathname === '/' || pathname === '') {
      router.replace('/(tabs)/(home)' as never);
    }
  }, [pathname, router]);

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        initialRouteName="(home)"
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
        <Tabs.Screen name="index" options={{ href: null }} />
      </Tabs>
      <EdgeBlur
        position="top"
        height={insets.top + 40}
        style={{ position: 'absolute', top: 0, left: 0, right: 0 }}
      />
    </View>
  );
}
