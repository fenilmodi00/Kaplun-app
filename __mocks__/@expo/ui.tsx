// Manual mock for @expo/ui — keeps automate-home tests green without native dependencies
import React, { useState, useImperativeHandle, forwardRef } from 'react';
import { View, Switch as RNSwitch, TextInput as RNTextInput } from 'react-native';

export function Host({ children, style }: { children?: React.ReactNode; style?: any }) {
  return <View style={style}>{children}</View>;
}

export function Switch(props: any) {
  const { value, onValueChange, testID, disabled, accessibilityLabel, ...rest } = props;
  return (
    <RNSwitch
      value={value}
      onValueChange={onValueChange}
      testID={testID}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}
      {...rest}
    />
  );
}

export function useNativeState<T>(initial: T) {
  const [state] = useState({ value: initial });
  return state;
}

export const TextInput = forwardRef(function TextInput(props: any, ref: any) {
  const {
    value,
    defaultValue,
    onChangeText,
    accessibilityLabel,
    testID,
    placeholder,
    keyboardType,
    maxLength,
    secureTextEntry,
    multiline,
    editable,
    ...rest
  } = props;

  const initialText = value?.value ?? defaultValue ?? '';
  const [text, setText] = useState(String(initialText));

  useImperativeHandle(ref, () => ({
    focus: () => {},
    blur: () => {},
    clear: () => setText(''),
    isFocused: () => false,
  }));

  return (
    <RNTextInput
      value={text}
      onChangeText={(t: string) => {
        setText(t);
        onChangeText?.(t);
      }}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      placeholder={placeholder}
      keyboardType={keyboardType}
      maxLength={maxLength}
      secureTextEntry={secureTextEntry}
      multiline={multiline}
      editable={editable}
      {...rest}
    />
  );
});
