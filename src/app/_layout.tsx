import '@/global.css';
import '@/lib/polyfills';
import { useCallback, useEffect, useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Slot } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ClerkProvider, useAuth } from '@clerk/clerk-expo';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SystemUI from 'expo-system-ui';
import * as NavigationBar from 'expo-navigation-bar';
import { createAppwriteSession } from '@/lib/auth-bridge';
import { secureTokenCache } from '@/lib/tokenCache';
import AuthScreen from '@/components/auth/AuthScreen';
import { useClayFonts } from '@/lib/fonts';
import { ClaySpinner } from '@/components/clay/ClaySpinner';
import { addLog } from '@/lib/logger';

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
      await NavigationBar.setBackgroundColorAsync(CANVAS);
      await NavigationBar.setButtonStyleAsync('dark');
      // Keep nav bar opaque so it blends with cream canvas (no white flash)
      await NavigationBar.setBorderColorAsync(CANVAS);
    } catch {
      // Expo Go / older devices may not support every API
    }
  }
}

function AuthGate() {
  const { isSignedIn, isLoaded, getToken } = useAuth();
  const [fontsLoaded, fontsError] = useClayFonts();
  const appwriteSessionCreated = useRef(false);
  const sessionAttempts = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    applyClaySystemChrome();
  }, []);

  const tryCreateSession = useCallback(async () => {
    try {
      const token = await getToken();
      if (token) {
        await createAppwriteSession(token);
      }
      appwriteSessionCreated.current = true;
      sessionAttempts.current = 0;
      if (retryTimer.current !== null) {
        clearTimeout(retryTimer.current);
        retryTimer.current = null;
      }
    } catch (err) {
      addLog('Failed to create Appwrite session: ' + String(err));
      appwriteSessionCreated.current = false;
      if (sessionAttempts.current < 3 && mountedRef.current) {
        const delays = [1000, 2000, 4000];
        retryTimer.current = setTimeout(tryCreateSession, delays[sessionAttempts.current]);
        sessionAttempts.current += 1;
      }
    }
  }, [getToken]);

  useEffect(() => {
    if (!isLoaded) return;

    if (isSignedIn && !appwriteSessionCreated.current) {
      appwriteSessionCreated.current = true;
      tryCreateSession();
    }

    if (!isSignedIn) {
      appwriteSessionCreated.current = false;
      sessionAttempts.current = 0;
      if (retryTimer.current !== null) {
        clearTimeout(retryTimer.current);
        retryTimer.current = null;
      }
    }

    return () => {
      if (retryTimer.current !== null) {
        clearTimeout(retryTimer.current);
        retryTimer.current = null;
      }
    };
  }, [isSignedIn, isLoaded, tryCreateSession]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

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
        <StatusBar style="dark" backgroundColor={CANVAS} />
        <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} tokenCache={secureTokenCache}>
          <AuthGate />
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
  },
});
