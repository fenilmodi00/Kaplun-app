import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ErrorState } from './error-state';

describe('ErrorState', () => {
  it('renders the error message', async () => {
    const { getByText } = await render(
      <ErrorState error="Could not load threads" onRetry={jest.fn()} />,
    );
    expect(getByText('Could not load threads')).toBeTruthy();
  });

  it('fires the retry callback when the Retry button is pressed', async () => {
    const onRetry = jest.fn();
    const { getByText } = await render(<ErrorState error="Boom" onRetry={onRetry} />);
    fireEvent.press(getByText('Retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('renders no Retry button when onRetry is omitted', async () => {
    const { getByText, queryByText } = await render(<ErrorState error="Boom" />);
    expect(getByText('Boom')).toBeTruthy();
    expect(queryByText('Retry')).toBeNull();
  });
});
