import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import type { TextStyle } from 'react-native';

export type SymbolName =
  | 'home'
  | 'automate'
  | 'messages'
  | 'publish'
  | 'insights'
  | 'profile';

const SF_SYMBOLS: Record<SymbolName, { inactive: string; active: string }> = {
  home: { inactive: 'house', active: 'house.fill' },
  automate: { inactive: 'bolt', active: 'bolt.fill' },
  messages: { inactive: 'bubble.left', active: 'bubble.left.fill' },
  publish: { inactive: 'plus.circle', active: 'plus.circle.fill' },
  insights: { inactive: 'chart.bar', active: 'chart.bar.fill' },
  profile: { inactive: 'person', active: 'person.fill' },
};

const IONICONS_MAP: Record<
  SymbolName,
  { inactive: keyof typeof Ionicons.glyphMap; active: keyof typeof Ionicons.glyphMap }
> = {
  home: { inactive: 'home-outline', active: 'home' },
  automate: { inactive: 'flash-outline', active: 'flash' },
  messages: { inactive: 'chatbubble-outline', active: 'chatbubble' },
  publish: { inactive: 'add-circle-outline', active: 'add-circle' },
  insights: { inactive: 'stats-chart-outline', active: 'stats-chart' },
  profile: { inactive: 'person-outline', active: 'person' },
};

interface SymbolIconProps {
  name: SymbolName;
  active?: boolean;
  size?: number;
  color: string;
}

export function SymbolIcon({
  name,
  active = false,
  size = 20,
  color,
}: SymbolIconProps) {
  if (process.env.EXPO_OS === 'ios') {
    const symbol = active
      ? SF_SYMBOLS[name].active
      : SF_SYMBOLS[name].inactive;

    return (
      <Image
        source={`sf:${symbol}`}
        style={{ width: size, height: size, tintColor: color as string }}
        contentFit="contain"
      />
    );
  }

  const iconName = active
    ? IONICONS_MAP[name].active
    : IONICONS_MAP[name].inactive;

  return (
    <Ionicons
      name={iconName}
      size={size}
      color={color}
      style={iconStyle as TextStyle}
    />
  );
}

const iconStyle = { marginBottom: -1 };
