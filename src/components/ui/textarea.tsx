import React, { useRef, useState, useImperativeHandle, forwardRef, createContext, useContext } from 'react';
import { TextInput as RNTextInput, StyleSheet } from 'react-native';
import { View } from '@/tw';

export type TextareaVariant = 'outline' | 'rounded' | 'underlined';
export type TextareaSize = 'sm' | 'md' | 'lg' | 'xl';

interface TextareaContextValue {
  variant: TextareaVariant;
  size: TextareaSize;
  isDisabled: boolean;
  isInvalid: boolean;
  isReadOnly: boolean;
}

const TextareaContext = createContext<TextareaContextValue>({
  variant: 'outline',
  size: 'md',
  isDisabled: false,
  isInvalid: false,
  isReadOnly: false,
});

export interface TextareaProps extends React.ComponentProps<typeof View> {
  variant?: TextareaVariant;
  size?: TextareaSize;
  isDisabled?: boolean;
  isInvalid?: boolean;
  isReadOnly?: boolean;
  className?: string;
}

export function Textarea({
  variant = 'outline',
  size = 'md',
  isDisabled = false,
  isInvalid = false,
  isReadOnly = false,
  className,
  children,
  ...rest
}: TextareaProps) {
  const { style, ...otherRest } = rest;
  return (
    <TextareaContext.Provider value={{ variant, size, isDisabled, isInvalid, isReadOnly }}>
      <View className={className} style={[{ minHeight: 96 }, style]} {...otherRest}>
        {children}
      </View>
    </TextareaContext.Provider>
  );
}

export interface TextareaInputRef {
  setText: (t: string) => void;
  clear: () => void;
  focus: () => void;
  blur: () => void;
}

export interface TextareaInputProps {
  placeholder?: string;
  defaultValue?: string;
  onChangeText?: (text: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  keyboardType?: React.ComponentProps<typeof RNTextInput>['keyboardType'];
  maxLength?: number;
  autoCapitalize?: React.ComponentProps<typeof RNTextInput>['autoCapitalize'];
  autoComplete?: React.ComponentProps<typeof RNTextInput>['autoComplete'];
  autoCorrect?: boolean;
  editable?: boolean;
  autoFocus?: boolean;
  rows?: number;
  numberOfLines?: number;
  testID?: string;
  accessibilityLabel?: string;
}

function borderRadiusFor(variant: TextareaVariant): number {
  if (variant === 'rounded') return 22;
  if (variant === 'underlined') return 0;
  return 12;
}

export const TextareaInput = forwardRef<TextareaInputRef, TextareaInputProps>(function TextareaInput(
  {
    placeholder,
    defaultValue = '',
    onChangeText,
    onFocus,
    onBlur,
    keyboardType,
    maxLength,
    autoCapitalize,
    autoComplete,
    autoCorrect,
    editable: editableProp,
    autoFocus,
    rows = 4,
    numberOfLines,
    testID,
    accessibilityLabel,
  },
  ref
) {
  const ctx = useContext(TextareaContext);
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

  const editable = editableProp !== undefined ? editableProp : !ctx.isDisabled && !ctx.isReadOnly;
  const isUnderlined = ctx.variant === 'underlined';
  const minHeight = Math.max(96, rows * 24);

  const inputStyle = [
    styles.base,
    {
      minHeight,
      borderRadius: borderRadiusFor(ctx.variant),
      backgroundColor: isUnderlined ? 'transparent' : focused ? '#ffffff' : '#faf5e8',
      borderColor: ctx.isInvalid ? '#ef4444' : focused ? '#b8a4ed' : '#e5e5e5',
      borderWidth: isUnderlined ? 0 : 2,
      borderBottomWidth: isUnderlined ? 2 : undefined,
      opacity: ctx.isDisabled ? 0.5 : 1,
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
      placeholderTextColor="#9a9a9a"
      keyboardType={keyboardType}
      maxLength={maxLength}
      autoCapitalize={autoCapitalize}
      autoComplete={autoComplete}
      autoCorrect={autoCorrect}
      editable={editable}
      autoFocus={autoFocus}
      multiline
      numberOfLines={numberOfLines ?? rows}
      textAlignVertical="top"
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      cursorColor="#0a0a0a"
      selectionColor="#b8a4ed"
      blurOnSubmit={false}
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
    paddingVertical: 12,
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    color: '#0a0a0a',
  },
});
