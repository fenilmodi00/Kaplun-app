import React from 'react';
import { View, Text } from '@/tw';
import { cn } from '@/tw/cn';

export type BadgeAction = 'error' | 'warning' | 'success' | 'info' | 'muted';
export type BadgeVariant = 'solid' | 'outline';
export type BadgeSize = 'sm' | 'md' | 'lg';

export interface BadgeProps extends React.ComponentProps<typeof View> {
  action?: BadgeAction;
  variant?: BadgeVariant;
  size?: BadgeSize;
  className?: string;
}

export function Badge({ action = 'muted', variant = 'solid', size = 'md', className, children, ...rest }: BadgeProps) {
  const sizeClasses: Record<BadgeSize, string> = {
    sm: 'px-2 py-0.5',
    md: 'px-2.5 py-1',
    lg: 'px-3 py-1.5',
  };

  const solidBg: Record<BadgeAction, string> = {
    error: 'bg-error',
    warning: 'bg-warning',
    success: 'bg-success',
    info: 'bg-brand-lavender',
    muted: 'bg-surface-card',
  };

  const outlineClasses: Record<BadgeAction, string> = {
    error: 'bg-transparent border border-error',
    warning: 'bg-transparent border border-warning',
    success: 'bg-transparent border border-success',
    info: 'bg-transparent border border-brand-lavender',
    muted: 'bg-transparent border border-hairline',
  };

  const variantClass = variant === 'solid' ? solidBg[action] : outlineClasses[action];

  return (
    <View className={cn('rounded-pill flex-row items-center', sizeClasses[size], variantClass, className)} {...rest}>
      {children}
    </View>
  );
}

export interface BadgeTextProps extends React.ComponentProps<typeof Text> {
  action?: BadgeAction;
  variant?: BadgeVariant;
  className?: string;
}

export function BadgeText({ action = 'muted', variant = 'solid', className, children, style, ...rest }: BadgeTextProps) {
  const solidText: Record<BadgeAction, string> = {
    error: 'text-on-primary',
    warning: 'text-on-primary',
    success: 'text-on-primary',
    info: 'text-on-primary',
    muted: 'text-muted',
  };

  const outlineText: Record<BadgeAction, string> = {
    error: 'text-error',
    warning: 'text-warning',
    success: 'text-success',
    info: 'text-brand-lavender',
    muted: 'text-muted',
  };

  const colorClass = variant === 'solid' ? solidText[action] : outlineText[action];

  return (
    <Text
      className={cn('font-semibold', colorClass, className)}
      style={[{ fontSize: 13, lineHeight: 16 }, style]}
      {...rest}
    >
      {children}
    </Text>
  );
}
