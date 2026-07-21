import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Compound utility constants — Clay design system building blocks
export const clayInput = 'h-11 py-3 bg-canvas border border-hairline rounded-md px-4 text-body-md text-ink';
export const clayCard = 'bg-canvas border border-hairline rounded-lg p-6';
export const clayFeatureCardBase = 'rounded-xl p-8 gap-3';
export const clayButtonBase = 'h-11 py-3 rounded-md px-5 flex-row items-center justify-center gap-2';
