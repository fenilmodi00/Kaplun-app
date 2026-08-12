import React, { useImperativeHandle, useState, useCallback } from 'react';
import { View, ScrollView, FlatList, SectionList, TextInput } from 'react-native';
import type { BottomSheetMethods, BottomSheetProps, BottomSheetViewProps } from '@expo/ui/community/bottom-sheet';

const noopMethods: BottomSheetMethods = {
  snapToIndex: () => {},
  snapToPosition: () => {},
  expand: () => {},
  collapse: () => {},
  close: () => {},
  forceClose: () => {},
  present: () => {},
  dismiss: () => {},
};

function useSheetMethods(
  ref: BottomSheetProps['ref'],
  {
    onChange,
    onClose,
    onDismiss,
    initialOpen,
  }: {
    onChange?: BottomSheetProps['onChange'];
    onClose?: BottomSheetProps['onClose'];
    onDismiss?: BottomSheetProps['onDismiss'];
    initialOpen: boolean;
  },
) {
  const [open, setOpen] = useState(initialOpen);

  const fireClose = useCallback(() => {
    setOpen(false);
    onClose?.();
    onDismiss?.();
    onChange?.(-1);
  }, [onChange, onClose, onDismiss]);

  const snapToIndex = useCallback(
    (index: number) => {
      if (index === -1) {
        fireClose();
        return;
      }
      setOpen(true);
      onChange?.(index);
    },
    [fireClose, onChange],
  );

  useImperativeHandle(
    ref,
    (): BottomSheetMethods => ({
      snapToIndex,
      snapToPosition: () => snapToIndex(0),
      expand: () => snapToIndex(0),
      collapse: () => snapToIndex(0),
      close: fireClose,
      forceClose: fireClose,
      present: () => snapToIndex(0),
      dismiss: fireClose,
    }),
    [fireClose, snapToIndex],
  );

  return { open, snapToIndex, fireClose };
}

export function BottomSheet({
  ref,
  children,
  index = 0,
  onChange,
  onClose,
  onDismiss,
}: BottomSheetProps) {
  const { open } = useSheetMethods(ref, {
    onChange,
    onClose,
    onDismiss,
    initialOpen: index >= 0,
  });

  if (!open) return null;
  return <View testID="mock-bottom-sheet">{children}</View>;
}

export function BottomSheetModal({
  ref,
  children,
  onChange,
  onClose,
  onDismiss,
}: BottomSheetProps) {
  const { open } = useSheetMethods(ref, {
    onChange,
    onClose,
    onDismiss,
    initialOpen: false,
  });

  if (!open) return null;
  return <View testID="mock-bottom-sheet-modal">{children}</View>;
}

export function BottomSheetView({ children, style }: BottomSheetViewProps) {
  return <View style={style}>{children}</View>;
}

export const BottomSheetScrollView = ScrollView;
export const BottomSheetFlatList = FlatList;
export const BottomSheetSectionList = SectionList;
export const BottomSheetTextInput = TextInput;

export function BottomSheetModalProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function useBottomSheet(): BottomSheetMethods {
  return noopMethods;
}

export default BottomSheet;
