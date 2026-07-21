import { Tabs } from 'expo-router';
import { ClayTabBar } from '@/components/clay/ClayTabBar';

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <ClayTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
      }}
    >
      <Tabs.Screen name="(home)" options={{ title: 'Home' }} />
      <Tabs.Screen name="(messages)" options={{ title: 'Messages' }} />
      <Tabs.Screen name="(profile)" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
