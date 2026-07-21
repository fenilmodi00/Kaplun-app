import { useCssElement } from 'react-native-css';
import React from 'react';
import { Image as RNImage } from 'react-native';

export const Image = (props: React.ComponentProps<typeof RNImage> & { className?: string }) =>
  useCssElement(RNImage, props, { className: 'style' });
Image.displayName = 'CSS(Image)';
