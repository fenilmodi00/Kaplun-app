import '@/global.css';
import '@/lib/polyfills';
import { useEffect } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { queryClient, persistOptions } from '@/lib/query-client';
import * as SystemUI from 'expo-system-ui';
import * as NavigationBar from 'expo-navigation-bar';
import { useClayFonts } from '@/lib/fonts';
import { ClaySpinner } from '@/components/clay/ClaySpinner';
import { BridgeProvider, useBridge } from '@/lib/bridge-context';
import { SessionProvider, useSession } from '@/lib/session-context';

/** Clay canvas — matches auth screen & Android nav bar */
const CANVAS = '#fffaf0';

async function applyClaySystemChrome() {
  try {
    await SystemUI.setBackgroundColorAsync(CANVAS);
  } catch {
    // ignore — unsupported on some hosts
  }

  if (Platform.OS === 'android') {
    try {
      await NavigationBar.setStyle('dark');
    } catch {
      // Expo Go / older devices may not support every API
    }
  }
}

function RootNavigator() {
  const [fontsLoaded, fontsError] = useClayFonts();
  const { session, isLoading } = useSession();
  const { setStatus } = useBridge();

  useEffect(() => {
    applyClaySystemChrome();
  }, []);

  useEffect(() => {
    setStatus(isLoading ? 'bridging' : 'ready');
  }, [isLoading, setStatus]);

  if ((!fontsLoaded && !fontsError) || isLoading) {
    return (
      <View style={styles.center}>
        <ClaySpinner size={40} label="Loading..." />
      </View>
    );
  }

  return (
    <View style={styles.shell}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: CANVAS } }}>
        <Stack.Protected guard={!!session}>
          <Stack.Screen name="(tabs)" />
        </Stack.Protected>
        <Stack.Protected guard={!session}>
          <Stack.Screen name="sign-in" />
        </Stack.Protected>
      </Stack>
    </View>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <View style={styles.root}>
        <StatusBar style="dark" />
        <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
          <SessionProvider>
            <BridgeProvider>
              <RootNavigator />
            </BridgeProvider>
          </SessionProvider>
        </PersistQueryClientProvider>
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: CANVAS,
  },
  shell: {
    flex: 1,
    backgroundColor: CANVAS,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CANVAS,
    gap: 16,
    padding: 24,
  },
});
