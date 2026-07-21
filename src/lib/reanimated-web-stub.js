/**
 * Web stub for react-native-reanimated / worklets.
 * Reanimated 4.1.1 crashes on web with Worklets #8285 —
 * Metro aliases to this file when platform === 'web'.
 */
const React = require('react');
const { View, Text, ScrollView, Image, FlatList } = require('react-native');

function passthrough(Component) {
  return Component;
}

function useSharedValue(init) {
  const ref = React.useRef({ value: init });
  return ref.current;
}

function useAnimatedStyle(updater) {
  try {
    return typeof updater === 'function' ? updater() : {};
  } catch {
    return {};
  }
}

function identity(v) {
  return v;
}

const Easing = {
  linear: identity,
  ease: identity,
  quad: identity,
  cubic: identity,
  poly: () => identity,
  sin: identity,
  circle: identity,
  exp: identity,
  elastic: () => identity,
  back: () => identity,
  bounce: identity,
  bezier: () => identity,
  in: identity,
  out: identity,
  inOut: identity,
};

const Animated = {
  View,
  Text,
  ScrollView,
  Image,
  FlatList,
  createAnimatedComponent: passthrough,
};

module.exports = {
  __esModule: true,
  default: Animated,
  ...Animated,
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps: useAnimatedStyle,
  useAnimatedScrollHandler: () => ({}),
  useAnimatedRef: () => React.useRef(null),
  useDerivedValue: (fn) => ({ value: typeof fn === 'function' ? fn() : fn }),
  useAnimatedReaction: () => {},
  useFrameCallback: () => ({ setActive: () => {} }),
  withTiming: identity,
  withSpring: identity,
  withDelay: (_d, v) => v,
  withSequence: (...args) => args[0],
  withRepeat: identity,
  cancelAnimation: () => {},
  runOnJS: (fn) => fn,
  runOnUI: (fn) => fn,
  Easing,
  FadeIn: {},
  FadeInUp: {},
  FadeInDown: {},
  FadeInLeft: {},
  FadeInRight: {},
  FadeOut: {},
  SlideInUp: {},
  SlideInDown: {},
  SlideInLeft: {},
  SlideInRight: {},
  Layout: {},
  ZoomIn: {},
  ZoomOut: {},
  StretchInY: {},
  StretchOutY: {},
  Keyframe: class Keyframe {},
  Extrapolation: { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' },
  interpolate: (v) => v,
  Extrapolate: { CLAMP: 'clamp' },
};
