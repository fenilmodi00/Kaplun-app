import { Stack } from 'expo-router';

export const unstable_settings = {
  anchor: 'dashboard',
};

export default function InsightsLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
