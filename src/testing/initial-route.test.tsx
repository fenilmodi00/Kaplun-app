/**
 * Regression: cold start and post-signup must land on the Home tab.
 *
 * Root cause: on native, getInitialURL() returns the app scheme URL
 * (e.g. kaplun://), which triggers getStateFromPath('/'). When multiple
 * tab groups each own an index.tsx, every group index maps to "/" and
 * the linking config resolves to the first alphabetical group — (automate).
 *
 * Structural fix: only (home) has an index.tsx. All other tab groups use
 * named routes (list, threads, dashboard, view) so their URLs no longer
 * compete for "/". No redirect route, no useLayoutEffect, no anchor hacks.
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

import React from 'react';
import { Text } from 'react-native';
import { renderRouter, screen } from 'expo-router/testing-library';
import { Stack, Tabs } from 'expo-router';

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

function groupStackWithSettings(names: string[], settings: object) {
  return {
    default: groupStack(...names),
    unstable_settings: settings,
  };
}

function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="(home)" />
      <Tabs.Screen name="(automate)" />
      <Tabs.Screen name="(messages)" />
      <Tabs.Screen name="(insights)" />
    </Tabs>
  );
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

const routes = {
  '(tabs)/(automate)/[automationId]': marker('AUTOMATE_DETAIL'),
  '(tabs)/(automate)/_layout': groupStackWithSettings(['list', 'new', '[automationId]'], { anchor: 'list' }),
  '(tabs)/(automate)/list': marker('AUTOMATE'),
  '(tabs)/(automate)/new': marker('AUTOMATE_NEW'),
  '(tabs)/(home)/_layout': groupStackWithSettings(['index'], { anchor: 'index' }),
  '(tabs)/(home)/index': marker('HOME'),
  '(tabs)/(insights)/_layout': groupStackWithSettings(['index'], { anchor: 'dashboard' }),
  '(tabs)/(insights)/dashboard': marker('INSIGHTS'),
  '(tabs)/(messages)/[threadId]': marker('THREAD'),
  '(tabs)/(messages)/_layout': groupStackWithSettings(['index'], { anchor: 'threads' }),
  '(tabs)/(messages)/threads': marker('MESSAGES'),
  '(tabs)/(profile)/_layout': groupStackWithSettings(['index'], { anchor: 'view' }),
  '(tabs)/(profile)/view': marker('PROFILE'),
  '(tabs)/_layout': { default: TabsLayout },
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
