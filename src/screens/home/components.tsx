import React, { useEffect } from 'react';
import { AnimatedView } from '@/tw/animated';
import { useShakeAnimation } from '@/tw/animated';

export { Reveal } from '@/components/ui/reveal';

export function ErrorShake({ children }: { children: React.ReactNode }) {
  const { shake, animatedStyle } = useShakeAnimation();
  useEffect(() => {
    shake();
  }, [shake]);
  return <AnimatedView style={animatedStyle}>{children}</AnimatedView>;
}
