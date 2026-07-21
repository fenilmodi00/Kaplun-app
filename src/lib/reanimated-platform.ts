import { Platform, View, Text } from 'react-native';

/**
 * Whether react-native-reanimated is available on the current platform.
 * On web, Reanimated v4.1.1 may crash with "createSerializableObject should never be called in JSWorklets" (#8285).
 */
export const IS_REANIMATED_AVAILABLE = Platform.OS !== 'web';

type SharedValue<T> = { value: T };

function createFallbackSharedValue<T>(v: T): SharedValue<T> {
  return { value: v };
}

const FallbackEasing = {
  linear: (t: number) => t,
  ease: (t: number) => t,
  quad: (t: number) => t,
  cubic: (t: number) => t,
  poly: () => (t: number) => t,
  sin: (t: number) => t,
  circle: (t: number) => t,
  exp: (t: number) => t,
  elastic: () => (t: number) => t,
  back: () => (t: number) => t,
  bounce: (t: number) => t,
  bezier: () => (t: number) => t,
  in: (fn: (t: number) => number) => fn,
  out: (fn: (t: number) => number) => fn,
  inOut: (fn: (t: number) => number) => fn,
};

/** No-op animation helpers used on web so callers keep the same API. */
const fallbacks = {
  default: { View, Text, createAnimatedComponent: <T,>(C: T) => C, ScrollView: View },
  View,
  Text,
  ScrollView: View,
  createAnimatedComponent: <T,>(C: T) => C,
  useSharedValue: createFallbackSharedValue,
  useAnimatedStyle: (fn: () => Record<string, unknown>) => {
    try {
      return fn();
    } catch {
      return {};
    }
  },
  useAnimatedScrollHandler: () => ({}),
  withTiming: <T,>(v: T) => v,
  withSpring: <T,>(v: T) => v,
  withSequence: <T,>(...args: T[]) => args[0],
  withRepeat: <T,>(v: T) => v,
  withDelay: <T,>(_d: number, v: T) => v,
  Easing: FallbackEasing,
};

const NativeReanimated = IS_REANIMATED_AVAILABLE
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('react-native-reanimated')
  : fallbacks;

/** Namespace matching typical `import * as Reanimated` / default+named usage. */
export const Reanimated = NativeReanimated;

export default (NativeReanimated.default ?? NativeReanimated) as typeof fallbacks.default;
export const useSharedValue = NativeReanimated.useSharedValue as typeof createFallbackSharedValue;
export const useAnimatedStyle = NativeReanimated.useAnimatedStyle as typeof fallbacks.useAnimatedStyle;
export const useAnimatedScrollHandler = NativeReanimated.useAnimatedScrollHandler;
export const withTiming = NativeReanimated.withTiming as typeof fallbacks.withTiming;
export const withSpring = NativeReanimated.withSpring as typeof fallbacks.withSpring;
export const withSequence = NativeReanimated.withSequence as typeof fallbacks.withSequence;
export const withRepeat = NativeReanimated.withRepeat as typeof fallbacks.withRepeat;
export const withDelay = NativeReanimated.withDelay as typeof fallbacks.withDelay;
export const Easing = NativeReanimated.Easing as typeof FallbackEasing;
export const createAnimatedComponent = NativeReanimated.createAnimatedComponent as typeof fallbacks.createAnimatedComponent;
