import React from 'react';
import { View } from '@/tw';
import { cn } from '@/tw/cn';

export type CardVariant = 'elevated' | 'outline' | 'ghost' | 'filled';
export type CardSize = 'sm' | 'md' | 'lg';

export interface CardProps extends React.ComponentProps<typeof View> {
  variant?: CardVariant;
  size?: CardSize;
  className?: string;
}

export function Card({ variant = 'outline', size = 'md', className, children, ...rest }: CardProps) {
  const variantClasses: Record<CardVariant, string> = {
    outline: 'border border-hairline rounded-[16px] bg-canvas',
    elevated: 'border border-hairline rounded-[16px] bg-canvas shadow-sm shadow-black/10',
    ghost: 'bg-transparent',
    filled: 'bg-surface-card border border-hairline rounded-[16px]',
  };

  const sizeClasses: Record<CardSize, string> = {
    sm: 'p-3',
    md: 'p-4',
    lg: 'p-6',
  };

  return (
    <View className={cn(variantClasses[variant], sizeClasses[size], className)} {...rest}>
      {children}
    </View>
  );
}
