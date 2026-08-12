import React, { createRef } from 'react';
import { act, render } from '@testing-library/react-native';
import { Text } from '@/tw';
import {
  BottomSheetModal,
  BottomSheetView,
  type BottomSheetMethods,
} from './index';

jest.mock('@expo/ui/community/bottom-sheet');

describe('BottomSheetModal', () => {
  it('shows children after present()', async () => {
    const ref = createRef<BottomSheetMethods>();
    const { getByText, queryByText } = await render(
      <BottomSheetModal ref={ref}>
        <BottomSheetView>
          <Text>Sheet body</Text>
        </BottomSheetView>
      </BottomSheetModal>,
    );

    expect(queryByText('Sheet body')).toBeNull();

    await act(() => {
      ref.current?.present();
    });

    expect(getByText('Sheet body')).toBeTruthy();
  });

  it('hides children after dismiss()', async () => {
    const ref = createRef<BottomSheetMethods>();
    const { getByText, queryByText } = await render(
      <BottomSheetModal ref={ref}>
        <BottomSheetView>
          <Text>Dismiss me</Text>
        </BottomSheetView>
      </BottomSheetModal>,
    );

    await act(() => {
      ref.current?.present();
    });
    expect(getByText('Dismiss me')).toBeTruthy();

    await act(() => {
      ref.current?.dismiss();
    });
    expect(queryByText('Dismiss me')).toBeNull();
  });
});
