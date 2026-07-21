import React from 'react';
import { Image } from '@/tw/image';
import { cn } from '@/tw/cn';

export function ClayAvatar({
  src, size = 64, className,
}: { src?: string; size?: number; className?: string }) {
  if (!src) {
    return <Image className={cn('bg-surface-card', className)} style={{ width: size, height: size, borderRadius: 9999 }} />;
  }
  return <Image className={className} source={{ uri: src }} style={{ width: size, height: size, borderRadius: 9999 }} />;
}
export default ClayAvatar;
