import { Stack } from 'expo-router';

export const unstable_settings = {
  anchor: 'list',
};

export default function AutomateLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="list" />
      <Stack.Screen name="new" />
      <Stack.Screen name="[automationId]" />
    </Stack>
  );
}
