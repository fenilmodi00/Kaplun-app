import React, { useRef, useState, useImperativeHandle, forwardRef, createContext, useContext } from 'react';
import { Host, TextInput as ExpoTextInput, useNativeState } from '@expo/ui';
import { View } from '@/tw';
import { cn } from '@/tw/cn';

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
      <View className={cn('w-full', className)} style={[{ minHeight: 96 }, style]} {...otherRest}>
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
  keyboardType?: React.ComponentProps<typeof ExpoTextInput>['keyboardType'];
  maxLength?: number;
  autoCapitalize?: React.ComponentProps<typeof ExpoTextInput>['autoCapitalize'];
  autoComplete?: React.ComponentProps<typeof ExpoTextInput>['autoComplete'];
  autoCorrect?: boolean;
  editable?: boolean;
  autoFocus?: boolean;
  rows?: number;
  numberOfLines?: number;
  testID?: string;
  accessibilityLabel?: string;
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
  const textState = useNativeState<string>(defaultValue);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<{
    focus: () => void;
    blur: () => void;
    clear: () => void;
    isFocused: () => boolean;
    setSelection: (start: number, end?: number) => Promise<void>;
  } | null>(null);

  useImperativeHandle(ref, () => ({
    setText: (t: string) => {
      textState.value = t;
    },
    clear: () => {
      textState.value = '';
      inputRef.current?.clear();
    },
    focus: () => {
      inputRef.current?.focus();
    },
    blur: () => {
      inputRef.current?.blur();
    },
  }));

  const handleChangeText = (text: string) => {
    textState.value = text;
    onChangeText?.(text);
  };

  let borderRadius: number;
  if (ctx.variant === 'rounded') {
    borderRadius = 22;
  } else if (ctx.variant === 'underlined') {
    borderRadius = 0;
  } else {
    borderRadius = 12;
  }

  const isUnderlined = ctx.variant === 'underlined';

  const style: React.ComponentProps<typeof ExpoTextInput>['style'] = {
    backgroundColor: isUnderlined ? 'transparent' : focused ? '#efe9da' : '#faf5e8',
    borderColor: ctx.isInvalid ? '#ef4444' : 'transparent',
    borderWidth: isUnderlined ? 0 : ctx.isInvalid ? 1 : 0,
    borderRadius,
    paddingHorizontal: 16,
    paddingVertical: 12,
    opacity: ctx.isDisabled ? 0.5 : 1,
  };

  const textStyle: React.ComponentProps<typeof ExpoTextInput>['textStyle'] = {
    color: '#0a0a0a',
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
  };

  const editable = editableProp !== undefined ? editableProp : !ctx.isDisabled;

  const a11y: { accessibilityLabel?: string } = { accessibilityLabel };

  return (
    <Host matchContents colorScheme="light">
      <ExpoTextInput
        ref={inputRef}
        value={textState}
        defaultValue={defaultValue}
        onChangeText={handleChangeText}
        placeholder={placeholder}
        placeholderTextColor="#9a9a9a"
        cursorColor="#0a0a0a"
        selectionColor="#0a0a0a"
        keyboardType={keyboardType}
        maxLength={maxLength}
        autoCapitalize={autoCapitalize}
        autoComplete={autoComplete}
        autoCorrect={autoCorrect}
        editable={editable}
        readOnly={ctx.isReadOnly}
        autoFocus={autoFocus}
        multiline
        rows={rows}
        numberOfLines={numberOfLines ?? rows}
        testID={testID}
        style={style}
        textStyle={textStyle}
        onFocus={() => {
          setFocused(true);
          onFocus?.();
        }}
        onBlur={() => {
          setFocused(false);
          onBlur?.();
        }}
        {...a11y}
      />
    </Host>
  );
});
