import '@/global.css';
import '@/lib/polyfills';
import { useEffect } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Slot } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ClerkProvider, useAuth } from "@clerk/expo";
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as SystemUI from 'expo-system-ui';
import * as NavigationBar from 'expo-navigation-bar';
import { tokenCache } from '@clerk/expo/token-cache';
import AuthScreen from '@/components/auth/AuthScreen';
import { useClayFonts } from '@/lib/fonts';
import { ClaySpinner } from '@/components/clay/ClaySpinner';
import { ensureAppwriteSession } from '@/lib/auth-bridge';

const CLERK_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
if (!CLERK_PUBLISHABLE_KEY) {
  throw new Error('EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY is not set. Add it to your .env file.');
}

/** Clay canvas — matches auth screen & Android nav bar */
const CANVAS = '#fffaf0';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: false,
    },
  },
});

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

function AuthGate() {
  const { isSignedIn, isLoaded, getToken } = useAuth();
  const [fontsLoaded, fontsError] = useClayFonts();

  useEffect(() => {
    applyClaySystemChrome();
  }, []);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;

    let cancelled = false;
    let timerId: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    const maxRetries = 3;

    async function trySession() {
      attempts++;
      try {
        if (!cancelled) {
          await ensureAppwriteSession(getToken);
        }
      } catch (_err) {
        if (cancelled) return;
        if (attempts <= maxRetries) {
          const backoff = Math.pow(2, attempts - 1) * 1000;
          timerId = setTimeout(trySession, backoff);
        }
      }
    }

    trySession();

    return () => {
      cancelled = true;
      if (timerId) clearTimeout(timerId);
    };
  }, [isLoaded, isSignedIn, getToken]);

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

  return <Slot />;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <View style={styles.root}>
        <StatusBar style="dark" />
        <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} tokenCache={tokenCache}>
          <QueryClientProvider client={queryClient}>
            <AuthGate />
          </QueryClientProvider>
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
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CANVAS,
    gap: 16,
    padding: 24,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 14,
    textAlign: 'center',
  },
});
