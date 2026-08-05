import React from 'react';
import { View, Pressable, Text } from 'react-native';

export function SegmentedControl({
  values,
  selectedIndex,
  onChange,
  onValueChange,
}: {
  values?: string[];
  selectedIndex?: number;
  onChange?: (event: { nativeEvent: { selectedSegmentIndex: number; value: string } }) => void;
  onValueChange?: (value: string) => void;
}) {
  return (
    <View style={{ flexDirection: 'row' }}>
      {values?.map((value, index) => (
        <Pressable
          key={value}
          onPress={() => {
            onValueChange?.(value);
            onChange?.({ nativeEvent: { selectedSegmentIndex: index, value } });
          }}
          accessibilityLabel={value}
        >
          <Text>{value}</Text>
        </Pressable>
      ))}
    </View>
  );
}
