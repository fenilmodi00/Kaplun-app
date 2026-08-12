import 'react-native-gesture-handler';
import '@/global.css';
import '@/lib/polyfills';
import { useEffect } from 'react';

export const unstable_settings = {
  // After sign-in the authenticated shell should start on the tabs navigator.
  anchor: '(tabs)',
};
import { AppState, Platform, View } from 'react-native';
import { Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { NavigationBar } from 'expo-navigation-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { onlineManager, focusManager } from '@tanstack/react-query';
import NetInfo from '@react-native-community/netinfo';
import { queryClient, persistOptions } from '@/lib/query-client';
import * as SystemUI from 'expo-system-ui';
import { useClayFonts } from '@/lib/fonts';
import { useThemeColors, hydrateThemePreference } from '@/lib/theme';
import { PanelUIProvider, Spinner, useThemeMode } from 'panelui-native';
import { useCSSVariable } from '@/tw';
import { BridgeProvider, useBridge } from '@/lib/bridge-context';
import { SessionProvider, useSession } from '@/lib/session-context';

onlineManager.setEventListener((setOnline) => {
  return NetInfo.addEventListener((state) => {
    setOnline(!!state.isConnected);
  });
});

focusManager.setEventListener((handleFocus) => {
  const subscription = AppState.addEventListener('change', (status) => {
    if (Platform.OS !== 'web') {
      handleFocus(status === 'active');
    }
  });
  return () => subscription.remove();
});

async function applySystemChrome(canvas: string) {
  try {
    await SystemUI.setBackgroundColorAsync(canvas);
  } catch {
    // ignore — unsupported on some hosts
  }
}

function RootNavigator() {
  const [fontsLoaded, fontsError] = useClayFonts();
  const { session, isLoading } = useSession();
  const { setStatus } = useBridge();
  const theme = useThemeColors();
  const background = useCSSVariable('--color-background') as string;

  useEffect(() => {
    applySystemChrome(background ?? theme.canvas);
  }, [background, theme.canvas]);

  useEffect(() => {
    setStatus(isLoading ? 'bridging' : 'ready');
  }, [isLoading, setStatus]);

  if ((!fontsLoaded && !fontsError) || isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: background ?? theme.canvas, gap: 16, padding: 24 }}>
        <Spinner size="md" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: background ?? theme.canvas }}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: background ?? theme.canvas } }}>
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
  const theme = useThemeColors();
  const { mode } = useThemeMode();
  const background = useCSSVariable('--color-background') as string;
  const canvas = background ?? theme.canvas;

  useEffect(() => {
    void hydrateThemePreference();
    // ponytail: stored-'light' users see a brief dark flash before hydration; acceptable, gate later if it matters.
  }, []);

  const navTheme = {
    dark: mode === 'dark',
    colors: {
      primary: theme.primary,
      background: canvas,
      card: canvas,
      text: theme.ink,
      border: theme.hairline,
      notification: theme.error,
    },
    fonts: {
      regular: { fontFamily: 'Inter_400Regular', fontWeight: 'normal' as const },
      medium: { fontFamily: 'Inter_500Medium', fontWeight: '500' as const },
      bold: { fontFamily: 'Inter_600SemiBold', fontWeight: '600' as const },
      heavy: { fontFamily: 'Inter_600SemiBold', fontWeight: '700' as const },
    },
  };

  return (
    <PanelUIProvider>
      <SafeAreaProvider>
        <ThemeProvider value={navTheme}>
          <View style={{ flex: 1, backgroundColor: canvas }}>
            <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
            <NavigationBar style={mode === 'dark' ? 'light' : 'dark'} />
            <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
              <SessionProvider>
                <BridgeProvider>
                  <RootNavigator />
                </BridgeProvider>
              </SessionProvider>
            </PersistQueryClientProvider>
          </View>
        </ThemeProvider>
      </SafeAreaProvider>
    </PanelUIProvider>
  );
}
