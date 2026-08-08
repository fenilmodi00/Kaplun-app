/**
 * TabBar unit tests.
 *
 * Verifies:
 * - All 5 tabs render with accessibility labels
 * - Pressing a tab calls navigation.navigate with the correct route
 * - No navigation when already focused or event is prevented
 * - Hides on nested 'new' route
 * - All tabs expose the tab role
 */

jest.mock('@/lib/haptics', () => ({
  hapticSelection: jest.fn(),
  hapticImpactLight: jest.fn(),
}));

// Mock SymbolIcon to avoid expo-image and @expo/vector-icons deps
jest.mock('@/components/symbol-icon', () => ({
  SymbolIcon: 'SymbolIcon',
}));

import React from 'react';
import { render, fireEvent, screen, act } from '@testing-library/react-native';
import { TabBar } from '@/components/clay/TabBar';
import { reportTabBarScroll, subscribeTabBarScroll } from '@/lib/tab-bar-scroll';
import type { BottomTabBarProps } from 'expo-router/js-tabs';

const TABS = [
  { name: '(home)', label: 'Home' },
  { name: '(automate)', label: 'Automate' },
  { name: '(messages)', label: 'Messages' },
  { name: '(insights)', label: 'Insights' },
  { name: '(profile)', label: 'Profile' },
];

function createMockProps(
  overrides: Partial<BottomTabBarProps> = {},
): BottomTabBarProps {
  const routes = TABS.map((t, i) => ({
    key: `${t.name}-k`,
    name: t.name,
    params: undefined,
    state: undefined,
  }));

  const state: BottomTabBarProps['state'] = {
    index: 0,
    routes,
    routeNames: TABS.map((t) => t.name),
    type: 'tab',
    stale: false,
    key: 'tab-key',
    history: routes.map((r) => ({ type: 'route' as const, key: r.key })),
    preloadedRouteKeys: [],
  };

  return {
    state,
    descriptors: Object.fromEntries(
      routes.map((r) => [
        r.key,
        {
          route: r,
          options: {},
          navigation: { emit: jest.fn() },
          render: () => null,
        },
      ]),
    ) as unknown as BottomTabBarProps['descriptors'],
    navigation: {
      emit: jest.fn(() => ({ defaultPrevented: false })),
      navigate: jest.fn(),
    } as unknown as BottomTabBarProps['navigation'],
    insets: { top: 0, right: 0, bottom: 0, left: 0 },
    ...overrides,
  };
}

describe('TabBar', () => {
  it('renders all 5 tabs', async () => {
    const props = createMockProps();
    await render(<TabBar {...props} />);

    TABS.forEach((tab) => {
      expect(screen.getByLabelText(tab.label)).toBeTruthy();
    });
  });

  it('press navigates', async () => {
    const props = createMockProps();
    await render(<TabBar {...props} />);

    fireEvent.press(screen.getByLabelText('Messages'));

    expect(props.navigation.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'tabPress',
        target: '(messages)-k',
        canPreventDefault: true,
      }),
    );
    expect(props.navigation.navigate).toHaveBeenCalledWith('(messages)');
  });

  it('no navigate when already focused', async () => {
    const props = createMockProps({ state: { ...createMockProps().state, index: 2 } });
    await render(<TabBar {...props} />);

    fireEvent.press(screen.getByLabelText('Messages'));

    expect(props.navigation.emit).toHaveBeenCalled();
    expect(props.navigation.navigate).not.toHaveBeenCalled();
  });

  it('no navigate when emit returns defaultPrevented', async () => {
    const props = createMockProps();
    (props.navigation.emit as jest.Mock).mockReturnValue({ defaultPrevented: true });

    await render(<TabBar {...props} />);

    fireEvent.press(screen.getByLabelText('Messages'));

    expect(props.navigation.navigate).not.toHaveBeenCalled();
  });

  it('hides on nested new route', async () => {
    const base = createMockProps();
    const routes = base.state.routes.map((r, i) =>
      i === base.state.index
        ? { ...r, state: { index: 0, routes: [{ name: 'new' }] } as unknown as BottomTabBarProps['state']['routes'][number]['state'] }
        : r,
    );
    const props = createMockProps({ state: { ...base.state, routes } });
    await render(<TabBar {...props} />);
    expect(screen.toJSON()).toBeNull();
  });

  it('all 5 Pressables expose the tab role', async () => {
    const props = createMockProps();
    await render(<TabBar {...props} />);
    expect(screen.getAllByRole('tab')).toHaveLength(5);
  });

  it('minimize smoke: active tab still renders after scroll', async () => {
    const props = createMockProps();
    await render(<TabBar {...props} />);

    act(() => {
      reportTabBarScroll(20);
    });

    expect(screen.getByLabelText('Home')).toBeTruthy();
  });
});

describe('tab-bar-scroll', () => {
  const unsubs: Array<() => void> = [];

  afterEach(() => {
    unsubs.forEach((u) => {
      u();
    });
    unsubs.length = 0;
  });

  it('delivers dy to subscriber', () => {
    const fn = jest.fn();
    unsubs.push(subscribeTabBarScroll(fn));
    reportTabBarScroll(12);
    expect(fn).toHaveBeenCalledWith(12);
  });

  it('unsubscribe stops delivery', () => {
    const fn = jest.fn();
    const unsub = subscribeTabBarScroll(fn);
    reportTabBarScroll(1);
    expect(fn).toHaveBeenCalledTimes(1);
    unsub();
    reportTabBarScroll(2);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});