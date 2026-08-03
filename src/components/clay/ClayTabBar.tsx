import React from 'react';
import { View, Text, Pressable } from '@/tw';
import { SymbolIcon } from '@/components/symbol-icon';
import { hapticSelection } from '@/lib/haptics';
import type { BottomTabBarProps } from "expo-router/js-tabs";

const TAB_NAMES: Record<string, 'home' | 'automate' | 'messages' | 'publish' | 'insights' | 'profile'> = {
  '(home)': 'home',
  '(automate)': 'automate',
  '(messages)': 'messages',
  '(publish)': 'publish',
  '(insights)': 'insights',
  '(profile)': 'profile',
};

const TABS = [
  { name: '(home)', label: 'Home' },
  { name: '(automate)', label: 'Automate' },
  { name: '(messages)', label: 'Messages' },
  { name: '(publish)', label: 'Publish' },
  { name: '(insights)', label: 'Insights' },
  { name: '(profile)', label: 'Profile' },
];

export function ClayTabBar({ state, navigation, insets }: BottomTabBarProps) {
  return (
    <View
      className="absolute left-3 right-3 bg-white border border-hairline flex-row"
      style={{
        bottom: insets.bottom + 8,
        borderRadius: 22,
        paddingVertical: 8,
        paddingHorizontal: 6,
        boxShadow: '0 6px 20px rgba(10,10,10,0.08)',
      }}
    >
      {TABS.map((tab, index) => {
        const isFocused = state.index === index;
        return (
          <Pressable
            key={tab.name}
            className="flex-1 items-center"
            style={{ paddingVertical: 6, paddingTop: 5, gap: 3 }}
            accessibilityRole="tab"
            accessibilityState={{ selected: isFocused }}
            onPress={() => {
              hapticSelection();
              const event = navigation.emit({
                type: 'tabPress',
                target: state.routes[index].key,
                canPreventDefault: true,
              });
              if (!isFocused && !event.defaultPrevented) {
                navigation.navigate(tab.name);
              }
            }}
          >
            <SymbolIcon
              name={TAB_NAMES[tab.name]}
              active={isFocused}
              size={20}
              color={isFocused ? '#0a0a0a' : '#9a9a9a'}
            />
            <Text
              className="font-medium"
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
              style={{
                fontSize: 10.5,
                color: isFocused ? '#0a0a0a' : '#9a9a9a',
              }}
            >
              {tab.label}
            </Text>
            <View
              style={{
                width: 14,
                height: 2.5,
                borderRadius: 2,
                backgroundColor: isFocused ? '#0a0a0a' : 'transparent',
                marginTop: 1,
              }}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

export default ClayTabBar;
