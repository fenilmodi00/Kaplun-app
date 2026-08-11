/**
 * ScreenShell unit tests.
 *
 * Verifies the padding formula:
 *   paddingTop = insets.top + 12
 *   paddingBottom = insets.bottom + TAB_BAR_CLEARANCE (110)
 *   paddingHorizontal = 18
 *
 * The center variant additionally yields flexGrow: 1, justifyContent: 'center'.
 *
 * NOTE: This verifies the formula only — real-device values are F3.
 */

import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { ScreenShell } from '@/components/screen-shell';

describe('ScreenShell', () => {
  it('applies the correct padding formula (insets are 0 in test mock)', async () => {
    await render(
      <ScreenShell testID="shell">
        <Text>Hello</Text>
      </ScreenShell>,
    );

    const scrollView = screen.getByTestId('shell');
    // contentContainerStyle is an array from the style merge — check first element
    const style = Array.isArray(scrollView.props.contentContainerStyle)
      ? scrollView.props.contentContainerStyle[0]
      : scrollView.props.contentContainerStyle;
    expect(style).toEqual(
      expect.objectContaining({
        paddingTop: 12,
        paddingBottom: 110,
        paddingHorizontal: 18,
      }),
    );
  });

  it('adds flexGrow and justifyContent center when center prop is true', async () => {
    await render(
      <ScreenShell testID="shell-center" center>
        <Text>Centered</Text>
      </ScreenShell>,
    );

    const scrollView = screen.getByTestId('shell-center');
    const style = Array.isArray(scrollView.props.contentContainerStyle)
      ? scrollView.props.contentContainerStyle
      : [scrollView.props.contentContainerStyle];
    expect(style[0]).toEqual(
      expect.objectContaining({
        paddingTop: 12,
        paddingBottom: 110,
        paddingHorizontal: 18,
      }),
    );
    expect(style[1]).toEqual(
      expect.objectContaining({
        flexGrow: 1,
        justifyContent: 'center',
      }),
    );
  });

  it('merges additional contentContainerStyle', async () => {
    await render(
      <ScreenShell testID="shell-merged" contentContainerStyle={{ backgroundColor: 'red' }}>
        <Text>Styled</Text>
      </ScreenShell>,
    );

    const scrollView = screen.getByTestId('shell-merged');
    const style = Array.isArray(scrollView.props.contentContainerStyle)
      ? scrollView.props.contentContainerStyle
      : [scrollView.props.contentContainerStyle];
    expect(style[0]).toEqual(
      expect.objectContaining({
        paddingTop: 12,
        paddingBottom: 110,
        paddingHorizontal: 18,
      }),
    );
    expect(style[2]).toEqual({ backgroundColor: 'red' });
  });
});
