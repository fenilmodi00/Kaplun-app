// Set required env vars before any module imports
process.env.EXPO_PUBLIC_IG_API_BASE_URL = 'http://localhost:8000';
process.env.EXPO_PUBLIC_IG_APP_ID = 'test_app_id';
process.env.EXPO_PUBLIC_IG_OAUTH_REDIRECT_URI = 'https://test-callback.example.com/';
process.env.EXPO_PUBLIC_APPWRITE_ENDPOINT = 'https://test-appwrite.example.com/v1';
process.env.EXPO_PUBLIC_APPWRITE_PROJECT_ID = 'test-project-id';

// Mock expo-font
jest.mock('expo-font', () => ({
  useFonts: () => [true, null],
  isLoaded: () => true,
  loadAsync: jest.fn().mockResolvedValue(undefined),
}));

// Mock @/lib/auth-session
jest.mock('@/lib/auth-session', () => ({
  restoreSession: jest.fn().mockResolvedValue(null),
  persistSession: jest.fn().mockResolvedValue(undefined),
  clearStoredSession: jest.fn().mockResolvedValue(undefined),
  getAppwriteJWT: jest.fn().mockResolvedValue('test-jwt'),
  extractSessionSecret: (session: { secret?: string }) => {
    if (session.secret) return session.secret;
    const raw = globalThis.localStorage?.getItem('cookieFallback');
    if (!raw) throw new Error('session_secret_missing');
    const cookies = JSON.parse(raw) as Record<string, string>;
    const projectId = process.env.EXPO_PUBLIC_APPWRITE_PROJECT_ID ?? '';
    const key = `a_session_${projectId}`;
    const fromCookie = cookies[key] ?? Object.values(cookies).find((v) => !!v);
    if (!fromCookie) throw new Error('session_secret_missing');
    return fromCookie;
  },
}));

// Mock expo-router
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    dismissTo: jest.fn(),
    back: jest.fn(),
  }),
  // Run the focus callback once on mount (same contract as useEffect for tests).
  useFocusEffect: (callback: () => void | (() => void)) => {
    const React = require('react');
    React.useEffect(() => {
      const cleanup = callback();
      return typeof cleanup === 'function' ? cleanup : undefined;
    }, [callback]);
  },
  useLocalSearchParams: () => ({}),
  Link: ({ children }: { children: React.ReactNode }) => children,
  Slot: ({ children }: { children?: React.ReactNode }) => children || null,
}));

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
    get: jest.fn().mockResolvedValue({ $id: 'test-appwrite-user-id' }),
    create: jest.fn().mockResolvedValue({}),
    createEmailPasswordSession: jest.fn().mockResolvedValue({}),
    createEmailToken: jest.fn().mockResolvedValue({ userId: 'test-appwrite-user-id' }),
    createSession: jest.fn().mockResolvedValue({}),
    createOAuth2Token: jest.fn().mockReturnValue('kaplun://oauth-callback?userId=test&secret=abc'),
    createJWT: jest.fn().mockResolvedValue({ jwt: 'test-jwt' }),
    deleteSession: jest.fn().mockResolvedValue({}),
    deleteSessions: jest.fn().mockResolvedValue({}),
  },
  storage: {},
  client: {
    setSession: jest.fn(),
  },
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
  makeRedirectUri: jest.fn().mockReturnValue('kaplun://instagram-callback'),
}));

// Mock expo-web-browser
jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: jest.fn().mockResolvedValue({
    type: 'success',
    url: 'kaplun://instagram-callback?code=test_auth_code'
  }),
}));

// Mock expo-blur
jest.mock('expo-blur', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    BlurView: (props: any) => React.createElement(View, { ...props, style: [props.style, { backgroundColor: 'transparent' }] }, props.children),
    BlurTargetView: React.forwardRef((props: any, ref: any) => React.createElement(View, { ...props, ref }, props.children)),
  };
});

// Mock @sbaiahmed1/react-native-blur
jest.mock('@sbaiahmed1/react-native-blur', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    LiquidGlassView: (props: any) => React.createElement(View, props, props.children),
    BlurView: (props: any) => React.createElement(View, props, props.children),
  };
});

// Mock @react-native-masked-view/masked-view
jest.mock('@react-native-masked-view/masked-view', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: (props: any) => React.createElement(View, props, props.children),
  };
});

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

  const createAnimMock = () => {
    const mock: any = {
      duration: jest.fn().mockReturnThis(),
      delay: jest.fn().mockReturnThis(),
      springify: jest.fn().mockReturnThis(),
      damping: jest.fn().mockReturnThis(),
      stiffness: jest.fn().mockReturnThis(),
      withCallback: jest.fn().mockReturnThis(),
      easing: jest.fn().mockReturnThis(),
    };
    return mock;
  };

  return {
    __esModule: true,
    View: (props: any) => React.createElement(RNView, props),
    Text: (props: any) => React.createElement(RNText, props),
    ScrollView: (props: any) => React.createElement(RNScrollView, props),
    FlatList: (props: any) => React.createElement(RNFlatList, props),
    Image: (props: any) => React.createElement(RNImage, props),
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
    FadeIn: createAnimMock(),
    FadeInUp: createAnimMock(),
    FadeInDown: createAnimMock(),
    FadeInLeft: createAnimMock(),
    FadeInRight: createAnimMock(),
    FadeOut: createAnimMock(),
    SlideInUp: createAnimMock(),
    SlideInDown: createAnimMock(),
    SlideInLeft: createAnimMock(),
    SlideInRight: createAnimMock(),
    LinearTransition: createAnimMock(),
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

// Mock AsyncStorage globally — query cache persistence (src/lib/query-client.ts)
// imports it at module load; the lib ships its own jest mock.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// NetInfo — always online in tests
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    addEventListener: jest.fn(() => jest.fn()),
    fetch: jest.fn(() => Promise.resolve({ isConnected: true, isInternetReachable: true })),
  },
}));

// Gesture handler — passthrough wrapper
jest.mock('react-native-gesture-handler', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    GestureHandlerRootView: View,
    Swipeable: View,
    DrawerLayout: View,
    State: {},
    PanGestureHandler: View,
    TapGestureHandler: View,
    FlingGestureHandler: View,
    ForceTouchGestureHandler: View,
    LongPressGestureHandler: View,
    NativeViewGestureHandler: View,
    PinchGestureHandler: View,
    RotationGestureHandler: View,
    RawButton: View,
    BaseButton: View,
    RectButton: View,
    BorderlessButton: View,
    FlatList: View,
    gestureHandlerRootHOC: (c: unknown) => c,
    Directions: {},
  };
});

// PagerView — stub for future swipe screens
jest.mock('react-native-pager-view', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: React.forwardRef(
      (
        { children, ...props }: { children?: React.ReactNode } & Record<string, unknown>,
        ref: React.Ref<unknown>,
      ) => React.createElement(View, { ...props, ref }, children),
    ),
  };
});

// Skia — stub canvas for future GPU work
jest.mock('@shopify/react-native-skia', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Stub = ({ children, ...props }: { children?: React.ReactNode } & Record<string, unknown>) =>
    React.createElement(View, props, children);
  return {
    Canvas: Stub,
    Circle: Stub,
    Group: Stub,
    Path: Stub,
    Skia: { Path: { Make: () => ({}) } },
    useValue: (v: unknown) => ({ current: v }),
    useComputedValue: (fn: () => unknown) => ({ current: fn() }),
  };
});

