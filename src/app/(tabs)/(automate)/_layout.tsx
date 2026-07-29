import { Stack } from 'expo-router';

export default function AutomateLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="new" />
      <Stack.Screen name="[automationId]" />
    </Stack>
  );
}
