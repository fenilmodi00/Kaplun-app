import '@/global.css';
import '@/lib/polyfills';
import { useEffect } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { NavigationBar } from 'expo-navigation-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { queryClient, persistOptions } from '@/lib/query-client';
import * as SystemUI from 'expo-system-ui';
import { useClayFonts } from '@/lib/fonts';
import { useThemeColors, useThemeScheme, hydrateThemePreference, cssVariablesForScheme } from '@/lib/theme';
import { ClaySpinner } from '@/components/clay/ClaySpinner';
import { BridgeProvider, useBridge } from '@/lib/bridge-context';
import { SessionProvider, useSession } from '@/lib/session-context';
import { VariableContextProvider } from 'nativewind';

async function applySystemChrome(canvas: string) {
  try {
    await SystemUI.setBackgroundColorAsync(canvas);
  } catch {
    // ignore — unsupported on some hosts
  }
}

function ThemeVariablesProvider({ children }: { children: React.ReactNode }) {
  const scheme = useThemeScheme();
  if (process.env.EXPO_OS === 'web') {
    return <>{children}</>;
  }
  return (
    <VariableContextProvider value={cssVariablesForScheme(scheme)}>
      {children}
    </VariableContextProvider>
  );
}

function RootNavigator() {
  const [fontsLoaded, fontsError] = useClayFonts();
  const { session, isLoading } = useSession();
  const { setStatus } = useBridge();
  const theme = useThemeColors();

  useEffect(() => {
    applySystemChrome(theme.canvas);
  }, [theme.canvas]);

  useEffect(() => {
    setStatus(isLoading ? 'bridging' : 'ready');
  }, [isLoading, setStatus]);

  if ((!fontsLoaded && !fontsError) || isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.canvas, gap: 16, padding: 24 }}>
        <ClaySpinner size={40} label="Loading..." />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.canvas }}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.canvas } }}>
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
  const scheme = useThemeScheme();

  useEffect(() => {
    void hydrateThemePreference();
    // ponytail: stored-'light' users see a brief dark flash before hydration; acceptable, gate later if it matters.
  }, []);

  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, backgroundColor: theme.canvas }}>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
        <NavigationBar style={scheme === 'dark' ? 'light' : 'dark'} />
        <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
          <SessionProvider>
            <BridgeProvider>
              <ThemeVariablesProvider>
                <RootNavigator />
              </ThemeVariablesProvider>
            </BridgeProvider>
          </SessionProvider>
        </PersistQueryClientProvider>
      </View>
    </SafeAreaProvider>
  );
}
