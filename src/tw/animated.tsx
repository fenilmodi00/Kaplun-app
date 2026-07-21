import Animated from 'react-native-reanimated';
import { View } from '@/tw/index';

/** Native: Reanimated Animated.View backed by tw.View (CSS-enabled). */
export const AnimatedView = Animated.createAnimatedComponent(View);
