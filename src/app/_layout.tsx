import '@/global.css';
import '@/lib/polyfills';
import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View, Text } from 'react-native';
import { Slot } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { queryClient, persistOptions } from '@/lib/query-client';
import * as SystemUI from 'expo-system-ui';
import * as NavigationBar from 'expo-navigation-bar';
import AuthScreen from '@/components/auth/AuthScreen';
import { useClayFonts } from '@/lib/fonts';
import { ClaySpinner } from '@/components/clay/ClaySpinner';
import { useAppwriteUser } from '@/hooks/useAppwriteUser';
import { getAppwriteJWT, restoreSession } from '@/lib/auth-session';
import { addLog } from '@/lib/logger';
import { BridgeProvider, useBridge } from '@/lib/bridge-context';

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

function fireEnsureProfile() {
  const baseUrl = process.env.EXPO_PUBLIC_IG_API_BASE_URL;
  if (!baseUrl) return;
  getAppwriteJWT()
    .then((jwt) => {
      fetch(`${baseUrl}/auth/ensure-profile`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${jwt}` },
      }).catch(() => {});
    })
    .catch((err: unknown) => {
      addLog(
        `[auth-gate] ensure-profile failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
}

/**
 * Instant shell: mount tabs immediately after Appwrite session restore.
 * Hooks wait on BridgeContext.isReady.
 */
function AuthGate() {
  const [fontsLoaded, fontsError] = useClayFonts();
  const { setStatus } = useBridge();
  const [restored, setRestored] = useState(false);
  const { data: user, isLoading: userLoading } = useAppwriteUser({ enabled: restored });
  const prevUserRef = useRef(user);

  useEffect(() => {
    applyClaySystemChrome();
  }, []);

  useEffect(() => {
    restoreSession().finally(() => setRestored(true));
  }, []);

  useEffect(() => {
    if (!restored || userLoading) {
      setStatus('bridging');
    } else {
      setStatus('ready');
    }
  }, [restored, userLoading, setStatus]);

  useEffect(() => {
    const prev = prevUserRef.current;
    prevUserRef.current = user;
    if (!prev && user) {
      fireEnsureProfile();
    }
  }, [user]);

  if (!fontsLoaded && !fontsError) {
    return (
      <View style={styles.center}>
        <ClaySpinner size={40} />
      </View>
    );
  }

  if (!restored || userLoading) {
    return (
      <View style={styles.center}>
        <ClaySpinner size={40} label="Loading..." />
      </View>
    );
  }

  if (!user) {
    return <AuthScreen />;
  }

  return (
    <View style={styles.shell}>
      <View style={styles.shellBody}>
        <Slot />
      </View>
    </View>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <View style={styles.root}>
        <StatusBar style="dark" />
        <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
          <BridgeProvider>
            <AuthGate />
          </BridgeProvider>
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
  shellBody: {
    flex: 1,
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
