import React from 'react';
import { Host, Switch as ExpoSwitch } from '@expo/ui';
import { useThemeMode } from 'panelui-native';

export interface SwitchProps {
  value: boolean;
  onValueChange: (v: boolean) => void;
  isDisabled?: boolean;
  testID?: string;
  accessibilityLabel?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function Switch({ value, onValueChange, isDisabled, testID, accessibilityLabel, size }: SwitchProps) {
  const a11y: { accessibilityLabel?: string } = { accessibilityLabel };
  const { mode: scheme } = useThemeMode();

  return (
    <Host matchContents colorScheme={scheme} seedColor="#22c55e">
      <ExpoSwitch
        value={value}
        onValueChange={onValueChange}
        disabled={isDisabled}
        testID={testID}
        {...a11y}
      />
    </Host>
  );
}
