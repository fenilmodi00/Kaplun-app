import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import AuthScreen from './AuthScreen';

const mockFlow = {
  mode: 'login' as 'login' | 'signup',
  step: 'idle' as string,
  error: null as string | null,
  isLoading: false,
  email: '',
  setMode: jest.fn(),
  submitEmailPassword: jest.fn(async () => {}),
  submitEmailOTP: jest.fn(async () => {}),
  submitOTP: jest.fn(async () => {}),
  loginWithGoogle: jest.fn(async () => {}),
  resendOTP: jest.fn(async () => {}),
};

jest.mock('@/hooks/useAuthFlow', () => ({
  useAuthFlow: () => mockFlow,
}));

describe('AuthScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFlow.mode = 'login';
    mockFlow.step = 'idle';
    mockFlow.error = null;
    mockFlow.isLoading = false;
    mockFlow.email = '';
  });

  it('renders the login form', async () => {
    const { getByPlaceholderText, getByText } = await render(<AuthScreen />);

    expect(getByText('Kaplun')).toBeTruthy();
    expect(getByPlaceholderText('Email address')).toBeTruthy();
    expect(getByText('Continue with Email')).toBeTruthy();
    expect(getByText('Continue with Google')).toBeTruthy();
  });

  it('gates Continue on a valid email, then submits the OTP flow', async () => {
    const { getByPlaceholderText, getByTestId } = await render(<AuthScreen />);
    const continueButton = () => getByTestId('auth-continue');

    expect(continueButton().props.accessibilityState.disabled).toBe(true);

    fireEvent.changeText(getByPlaceholderText('Email address'), 'creator@kaplun.app');
    await waitFor(() =>
      expect(continueButton().props.accessibilityState.disabled).toBe(false),
    );

    fireEvent.press(continueButton());
    expect(mockFlow.submitEmailOTP).toHaveBeenCalledWith('creator@kaplun.app');
  });

  it('renders the OTP view and auto-verifies a complete code', async () => {
    mockFlow.step = 'otp-sent';
    mockFlow.email = 'creator@kaplun.app';
    const { getByText, getByLabelText } = await render(<AuthScreen />);

    expect(getByText('Verify your email')).toBeTruthy();

    fireEvent.changeText(getByLabelText('Verification code'), '123456');
    await waitFor(() => expect(mockFlow.submitOTP).toHaveBeenCalledWith('123456'), {
      timeout: 1000,
    });
  });
});
