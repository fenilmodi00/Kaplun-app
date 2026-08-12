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
  isNetworkError: jest.fn().mockReturnValue(false),
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
    withTiming: (to: any, _config?: any, cb?: (finished?: boolean) => void) => { if (cb) cb(true); return to; },
    withSpring: (to: any, _config?: any, cb?: (finished?: boolean) => void) => { if (cb) cb(true); return to; },
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

// Mock @/tw/image (uses RN Image, not expo-image per D11)
jest.mock('@/tw/image', () => {
  const React = require('react');
  const { Image } = require('react-native');
  return { Image: (props: any) => React.createElement(Image, props) };
});

// Mock @/tw/animated
jest.mock('@/tw/animated', () => {
  const Reanimated = require('react-native-reanimated');
  return {
    AnimatedView: Reanimated.View || Reanimated.default?.View || Reanimated,
    useShakeAnimation: () => ({ shake: jest.fn(), animatedStyle: {} }),
  };
});

// Mock @/tw/cn
jest.mock('@/tw/cn', () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(' '),
  sheetContent: '',
}));

// Mock uniwind — provides useCSSVariable, useResolveClassNames, Uniwind, useUniwind
jest.mock('uniwind', () => {
  const React = require('react');
  return {
    useCSSVariable: (name: string | string[]) =>
      Array.isArray(name) ? name.map(() => '#000000') : '#000000',
    useResolveClassNames: () => ({}),
    useUniwind: () => ({ theme: 'dark' }),
    Uniwind: {
      setTheme: jest.fn(),
      getCSSVariable: (name: string | string[]) =>
        Array.isArray(name) ? name.map(() => '#000000') : '#000000',
    },
    withUniwind: (Comp: any) => Comp,
  };
});

// Mock panelui-native — PanelUIProvider, useThemeMode, useTheme, Spinner, and
// pass-through component mocks (Text/Button/Card/Surface/Avatar/Badge/Alert/
// Skeleton/EmptyState/Item/Kpi/BarChart/Input/OtpInput/Marker/Message/MessageScroller/Switch)
// so migrated screens render in tests. Text-bearing parts render a real RN
// Text so getByText queries keep working.
jest.mock('panelui-native', () => {
  const React = require('react');
  const { View, Text: RNText, Pressable, TextInput, ScrollView } = require('react-native');
  const viewPassthrough = (props: any) => React.createElement(View, props, props?.children);
  const textPassthrough = (props: any) => React.createElement(RNText, props, props?.children);
  // Compound families need per-family roots: Object.assign mutates the shared
  // function object, so two families assigning the same part name collide.
  const family = (parts: Record<string, unknown>) =>
    Object.assign((props: any) => viewPassthrough(props), parts);
  const wrapTextChild = (child: unknown): unknown => {
    if (typeof child === 'string' || typeof child === 'number') {
      return React.createElement(RNText, null, child);
    }
    // JSX interpolation like `{format(n)} followers` arrives as an array —
    // wrap each text node or RN throws "Text strings must be rendered in <Text>".
    if (Array.isArray(child)) return child.map(wrapTextChild);
    return child;
  };
  const mockFamily = {
    id: 'panel',
    name: 'Panel',
    light: 'light',
    dark: 'dark',
    swatch: ['#262626', '#f5f5f5'],
  };
  let currentMode = 'dark';
  return {
    PanelUIProvider: ({ children }: { children: React.ReactNode }) =>
      React.createElement(View, { style: { flex: 1 } }, children),
    useThemeMode: () => ({
      family: mockFamily,
      mode: currentMode,
      setFamily: jest.fn(),
      setMode: (m: string) => { currentMode = m; },
      toggleMode: () => { currentMode = currentMode === 'dark' ? 'light' : 'dark'; },
    }),
    useTheme: () => ({
      theme: currentMode === 'dark' ? 'dark' : 'light',
      setTheme: jest.fn(),
    }),
    Spinner: (props: any) => React.createElement(View, props),
    Text: textPassthrough,
    Button: ({ children, startContent, endContent, loading, ...props }: any) =>
      React.createElement(
        Pressable,
        props,
        loading ? null : startContent,
        wrapTextChild(children),
        endContent,
      ),
    Card: family({
      Header: viewPassthrough,
      Title: textPassthrough,
      Description: textPassthrough,
      Content: viewPassthrough,
      Footer: viewPassthrough,
    }),
    Surface: viewPassthrough,
    Avatar: viewPassthrough,
    Badge: ({ children, count, ...props }: any) =>
      React.createElement(View, props, wrapTextChild(count !== undefined ? String(count) : children)),
    Chip: ({ children, ...props }: any) =>
      React.createElement(Pressable, props, wrapTextChild(children)),
    Alert: family({
      Indicator: viewPassthrough,
      Content: viewPassthrough,
      Title: textPassthrough,
      Description: textPassthrough,
    }),
    Skeleton: viewPassthrough,
    EmptyState: family({
      Header: viewPassthrough,
      Media: viewPassthrough,
      Title: textPassthrough,
      Description: textPassthrough,
      Content: viewPassthrough,
    }),
    Item: Object.assign((props: any) =>
      React.createElement(props.onPress ? Pressable : View, props, props?.children), {
      Group: viewPassthrough,
      Separator: viewPassthrough,
      Media: viewPassthrough,
      Content: viewPassthrough,
      Title: textPassthrough,
      Description: textPassthrough,
      Actions: viewPassthrough,
      Header: viewPassthrough,
      Footer: viewPassthrough,
    }),
    Kpi: family({
      Header: viewPassthrough,
      Icon: viewPassthrough,
      Title: textPassthrough,
      Stat: viewPassthrough,
      Actions: viewPassthrough,
      Content: viewPassthrough,
      Value: textPassthrough,
      Trend: ({ value, format }: any) =>
        React.createElement(RNText, null, format ? format(value) : String(value)),
      Chart: () => null,
      Progress: () => null,
      Footer: viewPassthrough,
      Separator: viewPassthrough,
      Group: viewPassthrough,
    }),
    BarChart: family({
      Header: viewPassthrough,
      Grid: () => null,
      Bar: () => null,
      Skeleton: () => null,
      XAxis: () => null,
      YAxis: () => null,
      Tooltip: () => null,
      Legend: () => null,
    }),
    Input: (props: any) => React.createElement(TextInput, props),
    OtpInput: (props: any) => React.createElement(TextInput, props),
    Textarea: (props: any) => React.createElement(TextInput, { ...props, multiline: true }),
    Switch: (props: any) =>
      React.createElement(View, { accessible: true, accessibilityRole: 'switch', ...props }, props?.children),
    // Stateful mock mirroring the real component: Trigger/Close clone their
    // child and compose onPress; Content mounts only while open.
    Dialog: (() => {
      const DialogContext = React.createContext(null);
      const useDialog = () => React.useContext(DialogContext);
      const DialogRoot = (props: any) => {
        const [internalOpen, setInternalOpen] = React.useState(props?.defaultOpen ?? false);
        const isControlled = props?.open !== undefined;
        const open = isControlled ? props.open : internalOpen;
        const setOpen = (v: boolean) => {
          if (!isControlled) setInternalOpen(v);
          props?.onOpenChange?.(v);
        };
        return React.createElement(DialogContext.Provider, { value: { open, setOpen } }, props?.children);
      };
      const DialogTrigger = ({ children }: any) => {
        const ctx = useDialog();
        if (!React.isValidElement(children)) return children;
        return React.cloneElement(children as React.ReactElement<any>, {
          onPress: (...args: unknown[]) => {
            children.props?.onPress?.(...args);
            ctx?.setOpen(true);
          },
        });
      };
      const DialogContent = (props: any) => {
        const ctx = useDialog();
        if (!ctx?.open) return null;
        return React.createElement(View, props, props?.children);
      };
      const DialogClose = ({ children }: any) => {
        const ctx = useDialog();
        if (!React.isValidElement(children)) return children;
        return React.cloneElement(children as React.ReactElement<any>, {
          onPress: (...args: unknown[]) => {
            children.props?.onPress?.(...args);
            ctx?.setOpen(false);
          },
        });
      };
      return Object.assign(DialogRoot, {
        Trigger: DialogTrigger,
        Content: DialogContent,
        Title: textPassthrough,
        Description: textPassthrough,
        Footer: viewPassthrough,
        Close: DialogClose,
      });
    })(),
    Marker: family({
      Icon: viewPassthrough,
      Content: textPassthrough,
    }),
    Message: family({
      Group: viewPassthrough,
      Avatar: viewPassthrough,
      Content: viewPassthrough,
      Header: textPassthrough,
      Bubble: viewPassthrough,
      BubbleContent: textPassthrough,
      Footer: textPassthrough,
      Actions: viewPassthrough,
    }),
    MessageScroller: family({
      Viewport: (props: any) => React.createElement(ScrollView, props, props?.children),
      Content: viewPassthrough,
      Item: viewPassthrough,
      Button: () => null,
    }),
    PANEL_THEMES: [mockFamily],
    PANEL_THEME_NAMES: ['light', 'dark'],
    PANEL_EXTRA_THEMES: [],
    ThinkingOrb: (props: any) => {
      const stateLabels: Record<string, string> = {
        working: 'Working',
        searching: 'Searching',
        solving: 'Solving',
        listening: 'Listening',
        composing: 'Composing',
        shaping: 'Shaping',
      };
      const label = props?.accessibilityLabel || stateLabels[props?.state] || 'Working';
      return React.createElement(View, {
        accessibilityRole: 'image',
        accessibilityLabel: label,
      });
    },
    Shimmer: (props: any) => {
      const { children, duration, spread, mode, once, reverse, enabled, baseColor, shimmerColor, color, intensity, ...rest } = props;
      if (typeof children === 'string') {
        return React.createElement(RNText, rest, children);
      }
      return React.createElement(View, rest, children);
    },
    Plan: family({
      Header: viewPassthrough,
      Icon: viewPassthrough,
      Title: textPassthrough,
      Description: textPassthrough,
      Action: viewPassthrough,
      Progress: ({ value, total }: any) => {
        if (value !== undefined && total !== undefined) {
          return React.createElement(RNText, null, `${value} of ${total}`);
        }
        return null;
      },
      Trigger: viewPassthrough,
      Content: viewPassthrough,
      Steps: viewPassthrough,
      Step: textPassthrough,
      Footer: viewPassthrough,
    }),
    Task: Object.assign((props: any) => React.createElement(View, props, props?.children), {
      Trigger: ({ title, children, ...props }: any) =>
        React.createElement(View, props, title ? React.createElement(RNText, null, title) : children),
      Content: viewPassthrough,
      Item: textPassthrough,
      File: textPassthrough,
    }),
    BottomSheet: Object.assign(
      (props: any) => React.createElement(View, props, props?.children),
      {
        Content: viewPassthrough,
        Header: ({ title, description }: any) =>
          React.createElement(View, null,
            React.createElement(RNText, null, title),
            description ? React.createElement(RNText, null, description) : null,
          ),
        Body: viewPassthrough,
        Footer: viewPassthrough,
      },
    ),
  };
});

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
    GestureDetector: ({ children }: { children?: React.ReactNode }) =>
      React.createElement(View, null, children),
    Gesture: {
      Pan: () => {
        const chain: Record<string, unknown> = {};
        for (const m of ['onUpdate', 'onEnd', 'onStart', 'onFinalize', 'onTouchesDown', 'onTouchesUp', 'enabled', 'activeOffsetX', 'activeOffsetY', 'failOffsetX', 'failOffsetY', 'shouldCancelWhenOutside', 'runOnJS', 'simultaneousWithExternalGesture', 'blocksExternalGesture', 'manualActivation'])
          chain[m] = jest.fn().mockReturnValue(chain);
        return chain;
      },
      Tap: () => {
        const chain: Record<string, unknown> = {};
        for (const m of ['onStart', 'onEnd', 'onFinalize', 'enabled', 'numberOfTaps', 'runOnJS'])
          chain[m] = jest.fn().mockReturnValue(chain);
        return chain;
      },
      Native: () => {
        const chain: Record<string, unknown> = {};
        for (const m of ['onBegin', 'onStart', 'onEnd', 'onFinalize', 'enabled', 'shouldCancelWhenOutside', 'runOnJS'])
          chain[m] = jest.fn().mockReturnValue(chain);
        return chain;
      },
      Race: (..._g: unknown[]) => ({}),
      Simultaneous: (..._g: unknown[]) => ({}),
      Exclusive: (..._g: unknown[]) => ({}),
    },
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

