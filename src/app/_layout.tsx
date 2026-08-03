import '@/global.css';
import '@/lib/polyfills';
import { useEffect, useRef } from 'react';
import { Platform, StyleSheet, View, Text, Pressable } from 'react-native';
import { Slot } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ClerkProvider, useAuth } from "@clerk/expo";
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { queryClient, persistOptions } from '@/lib/query-client';
import * as SystemUI from 'expo-system-ui';
import * as NavigationBar from 'expo-navigation-bar';
import { tokenCache } from '@clerk/expo/token-cache';
import AuthScreen from '@/components/auth/AuthScreen';
import { useClayFonts } from '@/lib/fonts';
import { ClaySpinner } from '@/components/clay/ClaySpinner';
import { ensureAppwriteSession } from '@/lib/auth-bridge';
import { BridgeProvider, useBridge } from '@/lib/bridge-context';

const CLERK_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
if (!CLERK_PUBLISHABLE_KEY) {
  throw new Error('EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY is not set. Add it to your .env file.');
}

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

/**
 * Instant shell: mount tabs immediately after Clerk sign-in.
 * Bridge runs in parallel; hooks wait on BridgeContext.isReady.
 * Failure shows a soft Retry banner — never a full-screen lag wall.
 */
function AuthGate() {
  const { isSignedIn, isLoaded, getToken } = useAuth();
  const [fontsLoaded, fontsError] = useClayFonts();
  const { status, setStatus, retry, attemptKey } = useBridge();
  // Clerk recreates getToken every render — keep it out of effect deps or the
  // bridge restarts forever (status flips to bridging → home skeleton stuck).
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  useEffect(() => {
    applyClaySystemChrome();
  }, []);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) {
      setStatus('idle');
      return;
    }

    let cancelled = false;
    let timerId: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    const maxRetries = 3;

    setStatus('bridging');

    async function trySession() {
      attempts++;
      try {
        if (cancelled) return;
        await ensureAppwriteSession(() => getTokenRef.current());
        if (!cancelled) setStatus('ready');
      } catch (_err: unknown) {
        if (cancelled) return;
        if (attempts <= maxRetries) {
          const backoff = Math.pow(2, attempts - 1) * 1000;
          timerId = setTimeout(trySession, backoff);
        } else {
          setStatus('failed');
        }
      }
    }

    trySession();

    return () => {
      cancelled = true;
      if (timerId) clearTimeout(timerId);
    };
  }, [isLoaded, isSignedIn, setStatus, attemptKey]);

  if (!fontsLoaded && !fontsError) {
    return (
      <View style={styles.center}>
        <ClaySpinner size={40} />
      </View>
    );
  }

  if (!isLoaded) {
    return (
      <View style={styles.center}>
        <ClaySpinner size={40} label="Loading..." />
      </View>
    );
  }

  if (!isSignedIn) {
    return <AuthScreen />;
  }

  return (
    <View style={styles.shell}>
      {status === 'failed' ? (
        <View style={styles.banner} testID="bridge-failed-banner">
          <Text style={styles.bannerText}>Couldn’t connect to your workspace</Text>
          <Pressable
            onPress={retry}
            style={styles.retryBtn}
            accessibilityRole="button"
            accessibilityLabel="Retry"
          >
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : null}
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
        <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} tokenCache={tokenCache}>
          <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
            <BridgeProvider>
              <AuthGate />
            </BridgeProvider>
          </PersistQueryClientProvider>
        </ClerkProvider>
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
  banner: {
    backgroundColor: '#1a1a2e',
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  bannerText: {
    color: '#fffaf0',
    fontSize: 14,
    flex: 1,
    fontFamily: 'Inter_500Medium',
  },
  retryBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#fffaf0',
    borderRadius: 10,
  },
  retryText: {
    color: '#1a1a2e',
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
  },
  errorText: {
    color: '#ef4444',
    fontSize: 14,
    textAlign: 'center',
  },
});
