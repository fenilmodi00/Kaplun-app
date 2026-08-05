import React, { createContext, useContext } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { View, Text, Pressable } from '@/tw';
import { cn } from '@/tw/cn';
import { Pop } from './reveal';

/* ── RadioGroup context ── */

interface RadioGroupContextValue {
  value: string;
  onChange: (value: string) => void;
  isReadOnly?: boolean;
}

const RadioGroupContext = createContext<RadioGroupContextValue | null>(null);

function useRadioGroup() {
  const ctx = useContext(RadioGroupContext);
  if (!ctx) {
    throw new Error('Radio components must be used inside a RadioGroup');
  }
  return ctx;
}

/* ── RadioGroup ── */

export interface RadioGroupProps extends React.ComponentProps<typeof View> {
  value: string;
  onChange: (value: string) => void;
  isReadOnly?: boolean;
  className?: string;
}

export function RadioGroup({ value, onChange, isReadOnly, className, children, ...rest }: RadioGroupProps) {
  return (
    <RadioGroupContext.Provider value={{ value, onChange, isReadOnly }}>
      <View className={cn('gap-3', className)} {...rest}>
        {children}
      </View>
    </RadioGroupContext.Provider>
  );
}

/* ── Radio context ── */

interface RadioContextValue {
  value: string;
  selected: boolean;
  disabled: boolean;
}

const RadioContext = createContext<RadioContextValue | null>(null);

function useRadio() {
  const ctx = useContext(RadioContext);
  if (!ctx) {
    throw new Error('RadioIndicator and RadioLabel must be used inside a Radio');
  }
  return ctx;
}

/* ── Radio ── */

export interface RadioProps extends Omit<React.ComponentProps<typeof Pressable>, 'onPress'> {
  value: string;
  isDisabled?: boolean;
  isInvalid?: boolean;
  className?: string;
}

export function Radio({ value, isDisabled, className, children, ...rest }: RadioProps) {
  const group = useRadioGroup();
  const selected = group.value === value;
  const disabled = !!(isDisabled || group.isReadOnly);

  const handlePress = () => {
    if (!disabled) {
      group.onChange(value);
    }
  };

  return (
    <RadioContext.Provider value={{ value, selected, disabled }}>
      <Pressable
        onPress={handlePress}
        disabled={disabled}
        className={cn('flex-row items-center gap-3', className)}
        accessibilityRole="radio"
        accessibilityState={{ selected, disabled }}
        {...rest}
      >
        {children}
      </Pressable>
    </RadioContext.Provider>
  );
}

/* ── RadioIndicator ── */

export interface RadioIndicatorProps extends React.ComponentProps<typeof View> {
  className?: string;
}

export function RadioIndicator({ className, ...rest }: RadioIndicatorProps) {
  const radio = useRadio();
  return (
    <View
      className={cn(
        'h-[22px] w-[22px] rounded-pill border-2 items-center justify-center',
        radio.selected ? 'border-brand-lavender bg-brand-lavender' : 'border-hairline bg-transparent',
        className
      )}
      {...rest}
    >
      {radio.selected && (
        <Pop>
          <Ionicons name="checkmark" size={13} color="#ffffff" />
        </Pop>
      )}
    </View>
  );
}

/* ── RadioLabel ── */

export interface RadioLabelProps extends React.ComponentProps<typeof Text> {
  className?: string;
}

export function RadioLabel({ className, children, style, ...rest }: RadioLabelProps) {
  const radio = useRadio();
  // Font metrics stay inline — Tailwind v4 typography tokens (text-body-md etc.)
  // miscompile line-height on Android via react-native-css and balloon layouts.
  return (
    <Text
      className={cn('font-medium text-ink', radio.disabled && 'text-muted-soft', className)}
      style={[{ fontSize: 15, lineHeight: 20 }, style]}
      {...rest}
    >
      {children}
    </Text>
  );
}
