// Manual mock for @clerk/expo — avoids the need to install the package for testing
const React = require('react');

module.exports = {
  useAuth: () => ({
    isSignedIn: true,
    userId: 'test-user-id',
    getToken: jest.fn().mockResolvedValue('test-token'),
  }),
  useUser: () => ({
    user: {
      id: 'test-user-id',
      firstName: 'Test',
      emailAddresses: [{ emailAddress: 'test@example.com' }],
    },
  }),
  useClerk: () => ({
    signOut: jest.fn().mockResolvedValue(undefined),
  }),
  useSignIn: () => ({
    signIn: {
      __internal_future: {
        create: jest.fn().mockResolvedValue({ error: null }),
        emailCode: {
          sendCode: jest.fn().mockResolvedValue({ error: null }),
          verifyCode: jest.fn().mockResolvedValue({ error: null }),
        },
        finalize: jest.fn().mockResolvedValue({ error: null }),
      },
      status: 'needs_first_factor',
    },
    setActive: jest.fn().mockResolvedValue(undefined),
    isLoaded: true,
  }),
  useSignUp: () => ({
    signUp: {
      __internal_future: {
        password: jest.fn().mockResolvedValue({ error: null }),
        verifications: {
          sendEmailCode: jest.fn().mockResolvedValue({ error: null }),
          verifyEmailCode: jest.fn().mockResolvedValue({ error: null }),
        },
        finalize: jest.fn().mockResolvedValue({ error: null }),
      },
      status: 'missing_requirements',
    },
    setActive: jest.fn().mockResolvedValue(undefined),
    isLoaded: true,
  }),
  ClerkProvider: ({ children }: { children: any }) => children,
  ClerkLoaded: ({ children }: { children: any }) => children,
  ClerkLoading: ({ children }: { children: any }) => children,
};
