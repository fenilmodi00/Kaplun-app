import '@/global.css';
import '@/lib/polyfills';
import { useEffect } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Slot } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ClerkProvider, useAuth } from '@clerk/clerk-expo';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SystemUI from 'expo-system-ui';
import * as NavigationBar from 'expo-navigation-bar';
import { secureTokenCache } from '@/lib/tokenCache';
import AuthScreen from '@/components/auth/AuthScreen';
import { useClayFonts } from '@/lib/fonts';
import { ClaySpinner } from '@/components/clay/ClaySpinner';

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
  const { isSignedIn, isLoaded } = useAuth();
  const [fontsLoaded, fontsError] = useClayFonts();

  useEffect(() => {
    applyClaySystemChrome();
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

  // User is authenticated by Clerk — show the app immediately.
  // The Appwrite session (created on first sign-in, valid 1 year) is
  // persisted by the SDK. Data hooks self-heal if it ever expires.
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
    gap: 16,
    padding: 24,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 14,
    textAlign: 'center',
  },
});
