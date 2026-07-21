// Set required env vars before any module imports
process.env.EXPO_PUBLIC_IG_API_BASE_URL = 'http://localhost:8000';
process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test_mock_key';

// Mock @clerk/expo
jest.mock('@clerk/expo', () => ({
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
  ClerkProvider: ({ children }: { children: React.ReactNode }) => children,
  ClerkLoaded: ({ children }: { children: React.ReactNode }) => children,
  ClerkLoading: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock expo-router
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  }),
  useLocalSearchParams: () => ({}),
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock @/lib/appwrite
jest.mock('@/lib/appwrite', () => ({
  tablesDB: {
    listRows: jest.fn().mockResolvedValue({ rows: [], total: 0 }),
    getRow: jest.fn().mockResolvedValue({}),
    createRow: jest.fn().mockResolvedValue({}),
    updateRow: jest.fn().mockResolvedValue({}),
    deleteRow: jest.fn().mockResolvedValue({}),
  },
  realtime: {
    subscribe: jest.fn().mockReturnValue({
      unsubscribe: jest.fn(),
    }),
  },
  account: {
    createSession: jest.fn().mockResolvedValue({}),
  },
  storage: {},
  client: {},
}));

// Mock @/lib/auth-bridge
jest.mock('@/lib/auth-bridge', () => ({
  createAppwriteSession: jest.fn().mockResolvedValue({}),
}));

// Mock @/lib/realtime
jest.mock('@/lib/realtime', () => ({
  useRealtimeSubscription: jest.fn(),
}));

// Mock @/hooks/useDashboard
jest.mock('@/hooks/useDashboard', () => ({
  useDashboard: () => ({
    data: {
      creator: {
        $id: 'test-creator-id',
        ig_user_id: '12345',
        ig_username: 'test_creator',
        full_name: 'Test Creator',
        language_hint: 'english',
        follower_count: 1500,
        following_count: 500,
        media_count: 50,
        avg_reel_views: 2000,
        avg_views: 2000,
        engagement_rate: 5.2,
        creator_tier: 'micro',
      },
      threads: [],
      deals: [],
    },
    loading: false,
    error: null,
    refresh: jest.fn(),
  }),
}));

// Mock react-native-safe-area-context
jest.mock('react-native-safe-area-context', () => {
  const inset = { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
    SafeAreaConsumer: ({ children }: { children: (insets: typeof inset) => React.ReactNode }) => children(inset),
    useSafeAreaInsets: () => inset,
  };
});

// Mock expo-secure-store
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

// Mock expo-auth-session
jest.mock('expo-auth-session', () => ({
  useAuthRequest: jest.fn().mockReturnValue([{}, { startAsync: jest.fn() }]),
  makeRedirectUri: jest.fn().mockReturnValue('https://example.com/callback'),
}));

// Mock expo-web-browser
jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: jest.fn().mockResolvedValue({ type: 'success' }),
}));

// Mock react-native-reanimated
jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const { View: RNView, Text: RNText, ScrollView: RNScrollView, FlatList: RNFlatList, Image: RNImage } = require('react-native');

  const Reanimated = {
    View: (props: any) => React.createElement(RNView, props),
    Text: (props: any) => React.createElement(RNText, props),
    ScrollView: (props: any) => React.createElement(RNScrollView, props),
    FlatList: (props: any) => React.createElement(RNFlatList, props),
    Image: (props: any) => React.createElement(RNImage, props),
  };

  return {
    __esModule: true,
    useSharedValue: (init: any) => ({ value: init }),
    useAnimatedStyle: (cb: any) => cb(),
    useAnimatedProps: (cb: any) => cb(),
    useDerivedValue: (cb: any) => ({ value: cb() }),
    useAnimatedReaction: jest.fn(),
    useAnimatedGestureHandler: (handlers: any) => handlers,
    useAnimatedScrollHandler: (handlers: any) => handlers,
    useHandler: jest.fn(),
    withTiming: (to: any) => to,
    withSpring: (to: any) => to,
    withDecay: (config: any) => config,
    withSequence: (...args: any[]) => args[args.length - 1],
    withRepeat: (anim: any) => anim,
    withDelay: (delay: any, anim: any) => anim,
    cancelAnimation: jest.fn(),
    measure: jest.fn(),
    runOnUI: (fn: any) => fn,
    runOnJS: (fn: any) => fn,
    FadeIn: { duration: jest.fn().mockReturnThis(), delay: jest.fn().mockReturnThis() },
    FadeInUp: { duration: jest.fn().mockReturnThis(), delay: jest.fn().mockReturnThis() },
    FadeInDown: { duration: jest.fn().mockReturnThis(), delay: jest.fn().mockReturnThis() },
    FadeInLeft: { duration: jest.fn().mockReturnThis(), delay: jest.fn().mockReturnThis() },
    FadeInRight: { duration: jest.fn().mockReturnThis(), delay: jest.fn().mockReturnThis() },
    FadeOut: { duration: jest.fn().mockReturnThis(), delay: jest.fn().mockReturnThis() },
    SlideInUp: { duration: jest.fn().mockReturnThis(), delay: jest.fn().mockReturnThis() },
    SlideInDown: { duration: jest.fn().mockReturnThis(), delay: jest.fn().mockReturnThis() },
    SlideInLeft: { duration: jest.fn().mockReturnThis(), delay: jest.fn().mockReturnThis() },
    SlideInRight: { duration: jest.fn().mockReturnThis(), delay: jest.fn().mockReturnThis() },
    LinearTransition: { duration: jest.fn().mockReturnThis(), delay: jest.fn().mockReturnThis() },
    Easing: {
      linear: jest.fn(),
      ease: jest.fn(),
      quad: jest.fn(),
      cubic: jest.fn(),
      poly: jest.fn(),
      sin: jest.fn(),
      circle: jest.fn(),
      exp: jest.fn(),
      elastic: jest.fn(),
      back: jest.fn(),
      bounce: jest.fn(),
      bezier: jest.fn(),
      in: jest.fn(),
      out: jest.fn(),
      inOut: jest.fn(),
    },
    Animated: Reanimated,
    default: Reanimated,
  };
});

// Mock @/tw — className is a no-op in jest (no CSS runtime)
jest.mock('@/tw', () => {
  const React = require('react');
  const { View, Text, ScrollView, Pressable, TextInput, TouchableHighlight } = require('react-native');
  const passthrough = (Comp: any) => (props: any) => React.createElement(Comp, props);
  return {
    View: passthrough(View),
    Text: passthrough(Text),
    ScrollView: passthrough(ScrollView),
    Pressable: passthrough(Pressable),
    TextInput: passthrough(TextInput),
    TouchableHighlight: passthrough(TouchableHighlight),
    Link: ({ children, ...props }: any) => React.createElement(Text, props, children),
    useCSSVariable: () => '#000000',
    AnimatedScrollView: passthrough(ScrollView),
  };
});

// Mock @/tw/image (uses RN Image, not expo-image per D11)
jest.mock('@/tw/image', () => {
  const React = require('react');
  const { Image } = require('react-native');
  return { Image: (props: any) => React.createElement(Image, props) };
});

// Mock @/tw/animated
jest.mock('@/tw/animated', () => {
  const Reanimated = require('react-native-reanimated');
  return { AnimatedView: Reanimated.View || Reanimated.default?.View || Reanimated };
});

// Mock @/tw/cn
jest.mock('@/tw/cn', () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(' '),
  clayInput: '', clayCard: '', clayFeatureCardBase: '', clayButtonBase: '',
}));

// Mock nativewind + react-native-css at the module level
jest.mock('nativewind', () => ({
  useUnstableNativeVariable: () => '#000000',
  VariableContextProvider: ({ children }: any) => children,
  styled: (Comp: any) => Comp,
}));
jest.mock('react-native-css', () => ({
  useCssElement: (_: any, props: any) => props,
  useNativeVariable: () => '#000000',
}));
