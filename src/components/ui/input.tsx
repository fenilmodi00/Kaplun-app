import React, { useRef, useState, useImperativeHandle, forwardRef, createContext, useContext } from 'react';
import { TextInput as RNTextInput, StyleSheet } from 'react-native';
import { View } from '@/tw';
import { useThemeColors } from '@/lib/theme';

export type InputVariant = 'outline' | 'rounded' | 'underlined';
export type InputSize = 'sm' | 'md' | 'lg' | 'xl';

interface InputContextValue {
  variant: InputVariant;
  size: InputSize;
  isDisabled: boolean;
  isInvalid: boolean;
  isReadOnly: boolean;
}

const InputContext = createContext<InputContextValue>({
  variant: 'outline',
  size: 'md',
  isDisabled: false,
  isInvalid: false,
  isReadOnly: false,
});

export interface InputProps extends React.ComponentProps<typeof View> {
  variant?: InputVariant;
  size?: InputSize;
  isDisabled?: boolean;
  isInvalid?: boolean;
  isReadOnly?: boolean;
  className?: string;
}

export function Input({
  variant = 'outline',
  size = 'md',
  isDisabled = false,
  isInvalid = false,
  isReadOnly = false,
  className,
  children,
  ...rest
}: InputProps) {
  return (
    <InputContext.Provider value={{ variant, size, isDisabled, isInvalid, isReadOnly }}>
      <View className={className} {...rest}>
        {children}
      </View>
    </InputContext.Provider>
  );
}

export interface InputFieldRef {
  setText: (t: string) => void;
  clear: () => void;
  focus: () => void;
  blur: () => void;
}

export interface InputFieldProps {
  placeholder?: string;
  defaultValue?: string;
  onChangeText?: (text: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  keyboardType?: React.ComponentProps<typeof RNTextInput>['keyboardType'];
  maxLength?: number;
  secureTextEntry?: boolean;
  autoCapitalize?: React.ComponentProps<typeof RNTextInput>['autoCapitalize'];
  autoComplete?: React.ComponentProps<typeof RNTextInput>['autoComplete'];
  autoCorrect?: boolean;
  editable?: boolean;
  autoFocus?: boolean;
  testID?: string;
  accessibilityLabel?: string;
}

const SIZE_HEIGHT: Record<InputSize, number> = {
  sm: 36,
  md: 48,
  lg: 52,
  xl: 56,
};

function borderRadiusFor(variant: InputVariant): number {
  if (variant === 'rounded') return 24;
  if (variant === 'underlined') return 0;
  return 12;
}

export const InputField = forwardRef<InputFieldRef, InputFieldProps>(function InputField(
  {
    placeholder,
    defaultValue = '',
    onChangeText,
    onFocus,
    onBlur,
    keyboardType,
    maxLength,
    secureTextEntry,
    autoCapitalize,
    autoComplete,
    autoCorrect,
    editable: editableProp,
    autoFocus,
    testID,
    accessibilityLabel,
  },
  ref
) {
  const ctx = useContext(InputContext);
  const [value, setValue] = useState(defaultValue);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<RNTextInput>(null);

  useImperativeHandle(ref, () => ({
    setText: (t: string) => {
      setValue(t);
    },
    clear: () => {
      setValue('');
      inputRef.current?.clear();
    },
    focus: () => {
      inputRef.current?.focus();
    },
    blur: () => {
      inputRef.current?.blur();
    },
  }));

  const t = useThemeColors();
  const editable = editableProp !== undefined ? editableProp : !ctx.isDisabled && !ctx.isReadOnly;
  const isUnderlined = ctx.variant === 'underlined';

  const inputStyle = [
    styles.base,
    {
      height: SIZE_HEIGHT[ctx.size],
      borderRadius: borderRadiusFor(ctx.variant),
      backgroundColor: isUnderlined ? 'transparent' : focused ? t.onPrimary : t.surfaceSoft,
      borderColor: ctx.isInvalid ? '#ef4444' : focused ? '#b8a4ed' : t.hairline,
      borderWidth: isUnderlined ? 0 : 2,
      borderBottomWidth: isUnderlined ? 2 : undefined,
      opacity: ctx.isDisabled ? 0.5 : 1,
      color: t.ink,
    },
  ];

  return (
    <RNTextInput
      ref={inputRef}
      value={value}
      onChangeText={(text) => {
        setValue(text);
        onChangeText?.(text);
      }}
      placeholder={placeholder}
      placeholderTextColor={t.mutedSoft}
      keyboardType={keyboardType}
      maxLength={maxLength}
      secureTextEntry={secureTextEntry}
      autoCapitalize={autoCapitalize}
      autoComplete={autoComplete}
      autoCorrect={autoCorrect}
      editable={editable}
      autoFocus={autoFocus}
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      cursorColor={t.ink}
      selectionColor="#b8a4ed"
      returnKeyType="done"
      blurOnSubmit
      onFocus={() => {
        setFocused(true);
        onFocus?.();
      }}
      onBlur={() => {
        setFocused(false);
        onBlur?.();
      }}
      style={inputStyle}
    />
  );
});

const styles = StyleSheet.create({
  base: {
    width: '100%',
    paddingHorizontal: 16,
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
  },
});
