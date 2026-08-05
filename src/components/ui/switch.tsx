import React from 'react';
import { Host, Switch as ExpoSwitch } from '@expo/ui';

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

  return (
    <Host matchContents colorScheme="light" seedColor="#22c55e">
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
