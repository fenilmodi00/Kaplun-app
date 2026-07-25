import React from 'react';
import { Pressable } from 'react-native';
import { View, Text } from '@/tw';
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from "expo-router/js-tabs";

const TABS = [
  { name: '(home)', label: 'Home', icon: 'home-outline' as const, iconActive: 'home' as const },
  { name: '(messages)', label: 'Messages', icon: 'chatbubble-outline' as const, iconActive: 'chatbubble' as const },
  { name: '(publish)', label: 'Publish', icon: 'add-circle-outline' as const, iconActive: 'add-circle' as const },
  { name: '(insights)', label: 'Insights', icon: 'stats-chart-outline' as const, iconActive: 'stats-chart' as const },
  { name: '(profile)', label: 'Profile', icon: 'person-outline' as const, iconActive: 'person' as const },
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
            onPress={() => {
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
            <Ionicons
              name={isFocused ? tab.iconActive : tab.icon}
              size={20}
              color={isFocused ? '#0a0a0a' : '#9a9a9a'}
            />
            <Text
              className="font-medium"
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
