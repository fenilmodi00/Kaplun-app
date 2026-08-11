import { Stack } from 'expo-router';

export const unstable_settings = {
  anchor: 'threads',
};

export default function MessagesLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
