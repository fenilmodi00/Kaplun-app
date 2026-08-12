/**
 * Regression for: "Element type is invalid … Check BottomSheetBackdrop".
 *
 * Mirrors react-native-reanimated's real export shape (src/index.ts):
 * View lives on the default Animated namespace only — not as a named export.
 * jest.setup.ts puts View on both, which hides this bug; this file re-mocks.
 */
describe('BottomSheetBackdrop element types', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.doMock('react-native-reanimated', () => {
      const R = require('react');
      const { View: RNView, Text: RNText } = require('react-native');
      const Animated = {
        View: (props: Record<string, unknown>) => R.createElement(RNView, props),
        Text: (props: Record<string, unknown>) => R.createElement(RNText, props),
        createAnimatedComponent: <T,>(C: T) => C,
      };
      const hooks = {
        useSharedValue: (init: unknown) => ({ value: init }),
        useAnimatedStyle: (cb: () => unknown) => cb(),
        withTiming: (to: unknown, _c?: unknown, cb?: (finished?: boolean) => void) => {
          cb?.(true);
          return to;
        },
        withSpring: (to: unknown) => to,
        withSequence: (...args: unknown[]) => args[0],
        withRepeat: (v: unknown) => v,
        withDelay: (_d: unknown, v: unknown) => v,
        runOnJS: <T extends (...args: never[]) => unknown>(fn: T) => fn,
        Easing: {
          linear: (t: number) => t,
          ease: (t: number) => t,
          in: (fn: (t: number) => number) => fn,
          out: (fn: (t: number) => number) => fn,
          inOut: (fn: (t: number) => number) => fn,
        },
      };
      return {
        __esModule: true,
        default: { ...Animated, ...hooks },
        ...hooks,
        // no top-level View — matches package index
      };
    });
  });

  it('named Reanimated.View is a renderable component (Backdrop uses Reanimated.View)', () => {
    const { Reanimated } = require('@/lib/reanimated-platform') as {
      Reanimated: { View?: unknown };
    };
    expect(typeof Reanimated.View).toBe('function');
  });
});
