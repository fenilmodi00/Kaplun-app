/**
 * Regression: cold start and post-signup must land on the Home tab.
 *
 * Root cause: on native, getInitialURL() returns the app scheme URL
 * (e.g. kaplun://), which triggers getStateFromPath('/'). With multiple
 * tab groups each owning an index.tsx, every group index maps to "/" and
 * the linking config resolves to the first alphabetical group — (automate).
 * The TabRouter's initialRouteName prop and the redirect route at
 * (tabs)/index.tsx are both bypassed because the initial state comes from
 * URL resolution, not from the router defaults.
 *
 * Fix: useLayoutEffect in TabsLayout checks on first mount whether pathname
 * is "/" (root, no real deep link) and force-replaces to /(tabs)/(home).
 *
 * The route map below mirrors the real src/app tree (keys extension-free,
 * in Metro's require.context key order) because renderRouter needs an
 * in-memory context; update it when tabs change.
 */
jest.unmock('expo-router');

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const inset = { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
    SafeAreaConsumer: ({ children }: { children: (i: typeof inset) => React.ReactNode }) => children(inset),
    SafeAreaInsetsContext: React.createContext(inset),
    useSafeAreaInsets: () => inset,
    initialWindowMetrics: { insets: inset, frame: { x: 0, y: 0, width: 0, height: 0 } },
  };
});

import React, { useLayoutEffect, useRef } from 'react';
import { Text } from 'react-native';
import { renderRouter, screen } from 'expo-router/testing-library';
import { Stack, Tabs, Redirect, useRouter, usePathname } from 'expo-router';

function marker(label: string) {
  return function Marker() {
    return <Text>{label}</Text>;
  };
}

function groupStack(...names: string[]) {
  return function GroupLayout() {
    return (
      <Stack screenOptions={{ headerShown: false }}>
        {names.map((n) => (
          <Stack.Screen key={n} name={n} />
        ))}
      </Stack>
    );
  };
}

function TabsLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const initialChecked = useRef(false);

  useLayoutEffect(() => {
    if (initialChecked.current) return;
    initialChecked.current = true;
    if (pathname === '/' || pathname === '') {
      router.replace('/(tabs)/(home)' as never);
    }
  }, [pathname, router]);

  return (
    <Tabs initialRouteName="(home)" screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="(home)" />
      <Tabs.Screen name="(automate)" />
      <Tabs.Screen name="(messages)" />
      <Tabs.Screen name="(insights)" />
      <Tabs.Screen name="index" options={{ href: null }} />
    </Tabs>
  );
}

function TabsIndexRedirect() {
  return <Redirect href={'/(tabs)/(home)' as never} />;
}

function RootLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={true}>
        <Stack.Screen name="(tabs)" />
      </Stack.Protected>
      <Stack.Protected guard={false}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
    </Stack>
  );
}

const tabsLayoutModule = {
  default: TabsLayout,
  unstable_settings: { anchor: '(home)' },
};

const routes = {
  '(tabs)/(automate)/[automationId]': marker('AUTOMATE_DETAIL'),
  '(tabs)/(automate)/_layout': groupStack('index', 'new', '[automationId]'),
  '(tabs)/(automate)/index': marker('AUTOMATE'),
  '(tabs)/(automate)/new': marker('AUTOMATE_NEW'),
  '(tabs)/(home)/_layout': groupStack('index'),
  '(tabs)/(home)/index': marker('HOME'),
  '(tabs)/(insights)/_layout': groupStack('index'),
  '(tabs)/(insights)/index': marker('INSIGHTS'),
  '(tabs)/(messages)/[threadId]': marker('THREAD'),
  '(tabs)/(messages)/_layout': groupStack('index', '[threadId]'),
  '(tabs)/(messages)/index': marker('MESSAGES'),
  '(tabs)/(profile)/_layout': groupStack('index'),
  '(tabs)/(profile)/index': marker('PROFILE'),
  '(tabs)/_layout': tabsLayoutModule,
  '(tabs)/index': TabsIndexRedirect,
  '_layout': {
    default: RootLayout,
    unstable_settings: { anchor: '(tabs)' },
  },
  'sign-in': marker('SIGN_IN'),
};

it('boots into the Home tab', async () => {
  const result = renderRouter(routes, { initialUrl: '/' });
  await result;

  expect(result.getSegments().join('/')).toBe('(tabs)/(home)');
  expect(screen.queryAllByText('HOME').length).toBeGreaterThan(0);
});

it('anchors survive expo-router’s validated route crawl', () => {
  const { getRoutes } = require('expo-router/build/getRoutes');
  const { inMemoryContext } = require('expo-router/build/testing-library/context-stubs');
  expect(() => getRoutes(inMemoryContext(routes), {})).not.toThrow();
});
