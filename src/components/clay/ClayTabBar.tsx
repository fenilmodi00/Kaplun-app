import React from 'react';
import { View, Text, Pressable } from '@/tw';
import { SymbolIcon } from '@/components/symbol-icon';
import { hapticSelection } from '@/lib/haptics';
import { BlurView } from 'expo-blur';
import type { BottomTabBarProps } from "expo-router/js-tabs";
import type { View as RNView } from 'react-native';
import { EdgeBlur } from '@/components/edge-blur';

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

const PILL_HEIGHT = 66;

type ClayTabBarProps = BottomTabBarProps & {
  blurTarget: React.RefObject<RNView | null>;
};

export function ClayTabBar({ state, navigation, insets, blurTarget }: ClayTabBarProps) {
  // Focused flows nested inside a tab (the automation builder) render
  // full-screen with their own pinned CTA — the floating pill would sit on
  // top of it and swallow the taps, so the bar stays hidden there.
  const activeTab = state.routes[state.index];
  const nested = activeTab?.state;
  const nestedIndex = nested?.index ?? ((nested?.routes?.length ?? 1) - 1);
  const activeNestedRoute = nested?.routes?.[nestedIndex]?.name;
  if (activeNestedRoute === 'new') {
    return null;
  }

  return (
    <View
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        justifyContent: 'flex-end',
      }}
      pointerEvents="box-none"
    >
      {/*
        Blur region aligns with the top of the pill so there is no blur above
        the navbar. Height = insets.bottom + 8 (pill offset) + PILL_HEIGHT.
        This aligns with TAB_BAR_CLEARANCE=110 from screen-shell.tsx:
        insets.bottom + 8 + 66 + 36 = 110, where the extra 36 is scroll-content
        clearance, not part of the blur region.
      */}
      <EdgeBlur
        position="bottom"
        height={insets.bottom + 8 + PILL_HEIGHT}
        blurTarget={blurTarget}
        intensity={100}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}
      />
      <View
        className="border border-hairline"
        style={{
          marginHorizontal: 12,
          marginBottom: insets.bottom + 8,
          borderRadius: 22,
          overflow: 'hidden',
          boxShadow: '0 6px 20px rgba(10,10,10,0.08)',
        }}
      >
        <BlurView
          intensity={90}
          tint="systemThickMaterialLight"
          blurMethod="dimezisBlurViewSdk31Plus"
          blurReductionFactor={1}
          blurTarget={blurTarget}
          style={{ backgroundColor: 'rgba(255,250,240,0.85)' }}
        >
          <View className="flex-row" style={{ paddingVertical: 8, paddingHorizontal: 6 }}>
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
        </BlurView>
      </View>
    </View>
  );
}

export default ClayTabBar;
