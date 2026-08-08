import { View, Pressable } from '@/tw';
import { SymbolIcon } from '@/components/symbol-icon';
import { hapticSelection } from '@/lib/haptics';
import type { BottomTabBarProps } from "expo-router/js-tabs";
import { LiquidGlassView } from '@sbaiahmed1/react-native-blur';

const TAB_NAMES: Record<string, 'home' | 'automate' | 'messages' | 'insights' | 'profile'> = {
  '(home)': 'home',
  '(automate)': 'automate',
  '(messages)': 'messages',
  '(insights)': 'insights',
  '(profile)': 'profile',
};

const TABS = [
  { name: '(home)', label: 'Home' },
  { name: '(automate)', label: 'Automate' },
  { name: '(messages)', label: 'Messages' },
  { name: '(insights)', label: 'Insights' },
  { name: '(profile)', label: 'Profile' },
];

export function TabBar({ state, navigation, insets }: BottomTabBarProps) {
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
      <View
        className="border border-hairline"
        style={{
          marginHorizontal: 12,
          marginBottom: insets.bottom + 8,
          borderRadius: 9999,
          boxShadow: '0 6px 20px rgba(10,10,10,0.08)',
        }}
      >
        <LiquidGlassView
          glassType="regular"
          glassTintColor="#fffaf0"
          glassOpacity={0.55}
          reducedTransparencyFallbackColor="#fffaf0"
          style={{ borderRadius: 9999 }}
        >
          <View className="flex-row" style={{ paddingVertical: 8, paddingHorizontal: 6 }}>
            {TABS.map((tab, index) => {
              const isFocused = state.index === index;
              return (
                <Pressable
                  key={tab.name}
                  className="flex-1 items-center justify-center"
                  style={{ minHeight: 44 }}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: isFocused }}
                  accessibilityLabel={tab.label}
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
                    size={22}
                    color={isFocused ? '#0a0a0a' : '#9a9a9a'}
                  />
                </Pressable>
              );
            })}
          </View>
        </LiquidGlassView>
      </View>
    </View>
  );
}

export default TabBar;
