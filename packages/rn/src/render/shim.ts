/**
 * Headless render shim — the "RN-web container" inside the sandbox
 * Business Source License 1.1 (BSL-1.1)
 *
 * The V-1 sandbox denies network, so no react/react-native can be installed
 * inside it. This file is a self-contained CommonJS shim (zero dependencies)
 * that implements just enough of React + react-native to *render* generated
 * components headlessly: createElement, function components, useState /
 * useEffect / useMemo / useCallback / useRef / useContext, and a tree walker
 * that serializes the element tree to JSON. Console output is captured by the
 * harness; render-path errors are caught and reported as `runtimeError`;
 * effect errors are recorded as warn logs (the render still succeeds).
 *
 * The source is written into the sandbox root as `shim.cjs` and aliased as
 * both `react` and `react-native` via the harness's module-resolution hook.
 */

export const SHIM_SOURCE = `'use strict';
// --- headless React + react-native shim (zero deps) ---
const TYPE_SYMBOL = typeof Symbol === 'function' ? Symbol('react.element') : '@@element';

function createElement(type, props) {
  const config = props || {};
  const key = config.key != null ? String(config.key) : null;
  const children = [];
  for (let i = 2; i < arguments.length; i++) children.push(arguments[i]);
  if (config.children !== undefined) children.push(config.children);
  const flat = [];
  const seen = new Set();
  const flatten = (list) => {
    // Guard: cyclic arrays would recurse forever — treat them as empty.
    if (seen.has(list)) return;
    seen.add(list);
    for (const c of list) {
      if (Array.isArray(c)) flatten(c);
      else if (c !== null && c !== undefined && c !== false) flat.push(c);
    }
  };
  flatten(children);
  const p = {};
  for (const k of Object.keys(config)) {
    if (k !== 'children' && k !== 'key') p[k] = config[k];
  }
  if (flat.length > 0) p.children = flat;
  return { $$typeof: TYPE_SYMBOL, type, key, props: p };
}

const Fragment = '@@fragment';

const hooks = { stack: [] };
function currentHook() { return hooks.stack[hooks.stack.length - 1]; }
function useState(initial) {
  const h = currentHook();
  const idx = h.i++;
  if (!h.state[idx]) h.state[idx] = { value: typeof initial === 'function' ? initial() : initial };
  const slot = h.state[idx];
  return [slot.value, (next) => { slot.value = typeof next === 'function' ? next(slot.value) : next; }];
}
function useRef(initial) {
  const h = currentHook();
  const idx = h.i++;
  if (!h.state[idx]) h.state[idx] = { value: { current: initial } };
  return h.state[idx].value;
}
function useMemo(factory, deps) {
  const h = currentHook();
  const idx = h.i++;
  const prev = h.state[idx];
  const same = prev && Array.isArray(prev.deps) && Array.isArray(deps) && prev.deps.length === deps.length && prev.deps.every((d, i) => Object.is(d, deps[i]));
  if (!same) h.state[idx] = { value: factory(), deps };
  return h.state[idx].value;
}
function useCallback(fn, deps) { return useMemo(() => fn, deps); }
function useContext(ctx) { return ctx && ctx._value !== undefined ? ctx._value : (ctx && ctx.defaultValue); }
function createContext(defaultValue) {
  const ctx = { defaultValue, _value: undefined };
  // Rendering is a single depth-first pass, so the value set here stays live
  // while children resolve — no reset (a static approximation of React context).
  ctx.Provider = function Provider(props) {
    if (props.value !== undefined) ctx._value = props.value;
    return createElement(Fragment, null, props.children);
  };
  ctx.Consumer = function Consumer(props) { return typeof props.children === 'function' ? props.children(ctx._value !== undefined ? ctx._value : ctx.defaultValue) : null; };
  return ctx;
}
function useEffect(fn, deps) {
  const h = currentHook();
  const idx = h.i++;
  h.effects.push({ fn, deps, idx });
}

function resolveChildren(node, out, depth, maxDepth, maxNodes) {
  if (out.length >= maxNodes) return;
  if (depth > maxDepth) { out.push({ type: '#max-depth', key: null, props: {}, children: [] }); return; }
  const p = node.props || {};
  const children = p.children === undefined ? [] : (Array.isArray(p.children) ? p.children : [p.children]);
  for (const child of children) {
    if (out.length >= maxNodes) return;
    if (child === null || child === undefined || child === false || child === true) continue;
    if (typeof child === 'string' || typeof child === 'number') { out.push(child); continue; }
    if (Array.isArray(child)) {
      // Cyclic arrays (a.push(a)) would recurse forever — inline once, no loop.
      const walked = new Set();
      const inline = (list) => {
        if (walked.has(list) || out.length >= maxNodes) return;
        walked.add(list);
        for (const c of list) {
          if (Array.isArray(c)) inline(c);
          else if (c !== null && c !== undefined && c !== false) {
            if (typeof c === 'string' || typeof c === 'number') out.push(c);
            else if (c && c.$$typeof === TYPE_SYMBOL) renderToNodes(c, out, depth, maxDepth, maxNodes);
          }
        }
      };
      inline(child);
      continue;
    }
    if (child && child.$$typeof === TYPE_SYMBOL) { renderToNodes(child, out, depth, maxDepth, maxNodes); }
  }
}

function renderToNodes(el, out, depth, maxDepth, maxNodes) {
  const t = el.type;
  let typeName;
  let rendered = el;
  if (typeof t === 'function') {
    typeName = t.displayName || t.name || 'Component';
    const hookState = { i: 0, state: [], effects: [] };
    hooks.stack.push(hookState);
    try {
      rendered = t(el.props || {});
    } catch (err) {
      throw new Error('Error rendering <' + typeName + '>: ' + (err && err.message ? err.message : String(err)));
    } finally {
      hooks.stack.pop();
    }
    if (rendered && rendered.$$typeof === TYPE_SYMBOL) rendered = rendered; else rendered = { $$typeof: TYPE_SYMBOL, type: '@@text', key: null, props: { children: [String(rendered === undefined ? '' : rendered)] } };
    // run effects (best-effort; errors become warn logs, not render failures)
    for (const e of hookState.effects) {
      try { const r = e.fn(); if (r && typeof r.then === 'function') r.catch(() => {}); } catch (err) {
        if (typeof console !== 'undefined') console.warn('[effect error] ' + (err && err.message ? err.message : String(err)));
      }
    }
    const nodeProps = Object.assign({}, el.props || {});
    delete nodeProps.children;
    const node = { type: typeName, key: el.key, props: nodeProps, children: [] };
    out.push(node);
    if (rendered && rendered.$$typeof === TYPE_SYMBOL && typeof rendered.type === 'string') {
      // Host element (View/Text wrapper output, fragments): inline its children
      // into this node instead of nesting a duplicate host node.
      resolveChildren(rendered, node.children, depth + 1, maxDepth, maxNodes);
    } else if (rendered && rendered.$$typeof === TYPE_SYMBOL) {
      // Nested component: render it as its own subtree.
      renderToNodes(rendered, node.children, depth + 1, maxDepth, maxNodes);
    } else {
      resolveChildren(rendered, node.children, depth + 1, maxDepth, maxNodes);
    }
    return;
  }
  typeName = t === Fragment ? 'Fragment' : String(t);
  const hostProps = Object.assign({}, el.props || {});
  delete hostProps.children;
  const hostNode = { type: typeName, key: el.key, props: hostProps, children: [] };
  out.push(hostNode);
  resolveChildren(el, hostNode.children, depth + 1, maxDepth, maxNodes);
}

// Automatic JSX runtime surface (react/jsx-runtime) — maps to createElement.
const jsx = createElement;
const jsxs = createElement;
const jsxDEV = createElement;

function renderToJson(component, maxDepth, maxNodes) {
  const root = { type: '@@root', key: null, props: {}, children: [] };
  const el = typeof component === 'function' ? createElement(component) : component;
  if (!el || el.$$typeof !== TYPE_SYMBOL) {
    return { type: '@@text', key: null, props: {}, children: [String(el === undefined ? '' : el)] };
  }
  renderToNodes(el, root.children, 0, maxDepth, maxNodes);
  return root.children.length === 1 ? root.children[0] : root;
}

// --- react-native stub: host components + StyleSheet ---
function host(typeName) {
  const fn = function Host(props) { return createElement(typeName, props); };
  // Name the wrapper after its host type so the tree serializes <View> as
  // "View" (and so the walker's function branch reports the right name).
  try { Object.defineProperty(fn, 'name', { value: typeName }); } catch { /* frozen fn — name stays 'Host' */ }
  return fn;
}
const View = host('View'), Text = host('Text'), ScrollView = host('ScrollView'), Image = host('Image');
const TextInput = host('TextInput'), Pressable = host('Pressable'), TouchableOpacity = host('TouchableOpacity');
const TouchableHighlight = host('TouchableHighlight'), SafeAreaView = host('SafeAreaView'), Modal = host('Modal');
const ActivityIndicator = host('ActivityIndicator'), FlatList = host('FlatList'), SectionList = host('SectionList');
const KeyboardAvoidingView = host('KeyboardAvoidingView'), StatusBar = host('StatusBar'), Switch = host('Switch');
const StyleSheet = { create: (s) => s, flatten: (s) => s };
const Platform = { OS: 'web', select: (spec) => (spec && spec.web !== undefined ? spec.web : spec && spec.default) };
const Dimensions = { get: () => ({ width: 390, height: 844, scale: 1 }) };

// --- curated third-party stubs: the packages real Expo apps import that the
//     sandbox cannot install (network denied, no node_modules). These are
//     headless approximations — providers/containers pass children through,
//     host components render as host nodes, navigation surfaces a no-op API,
//     and setters are no-ops. Enough to render the element tree truthfully,
//     not to simulate device behavior. The harness aliases the package ids
//     below to this module.
const noop = () => {};
const noopNavigation = {
  navigate: noop, replace: noop, goBack: noop, push: noop, pop: noop, popToTop: noop,
  setOptions: noop, setParams: noop, reset: noop, dispatch: noop,
  canGoBack: () => false, isFocused: () => true, addListener: () => noop, removeListener: noop,
  getParent: () => null, getState: () => ({}), getId: () => undefined,
};
const safeRoute = (name) => ({ key: name, name, params: {} });
function passthrough(props) { return createElement(Fragment, null, props && props.children); }

// expo-status-bar
const setStatusBarStyle = noop;
const setStatusBarHidden = noop;
const setStatusBarNetworkActivityIndicatorVisible = noop;
const setStatusBarTranslucent = noop;
const setStatusBarBackgroundColor = noop;

// react-native-safe-area-context
function useSafeAreaInsets() { return { top: 0, right: 0, bottom: 0, left: 0 }; }
const SafeAreaProvider = passthrough;

// @react-navigation/native
const NavigationContainer = passthrough;

// @react-navigation/native-stack — renders each Screen's component with a
// safe navigation/route pair so screen bodies appear in the render tree
// without a real navigator.
function createNativeStackNavigator() {
  return {
    Navigator: function Navigator(props) { return createElement(Fragment, null, props && props.children); },
    Screen: function Screen(props) {
      if (props && props.component) {
        return createElement(props.component, { navigation: noopNavigation, route: safeRoute(props.name || 'Screen') });
      }
      return createElement(Fragment, null, props && props.children);
    },
  };
}

// --- extended curated stubs: the packages real generated apps import beyond
//     the base Expo/navigation set (same rationale — network denied, no
//     node_modules). Handlers/detectors/containers pass children through,
//     animation values are inert (shared values are plain { value } boxes,
//     drivers resolve to their target), fonts report loaded synchronously so
//     useFonts gates render their children, and icon/gradient/screen
//     components render as host nodes. One namespace serves every aliased
//     package, so the merged default export also carries the reanimated
//     'Animated' hosts and expo-constants fields (expo-constants is a
//     default-only import).
// react-native-gesture-handler
const GestureHandlerRootView = passthrough;
const GestureDetector = passthrough;
const State = { UNDETERMINED: 0, FAILED: 1, BEGAN: 2, CANCELLED: 3, ACTIVE: 4, END: 5 };
const Directions = { RIGHT: 1, LEFT: 2, UP: 4, DOWN: 8 };
function gestureBuilder() {
  // A callable proxy: any method access or call chains to another builder, so
  // Gesture.Pan().onStart(fn).activeOffsetX(10) never throws. .build yields
  // a plain config object; never thenable; stringifies as a normal function.
  return new Proxy(function () {}, {
    get: (_t, key) => {
      if (key === 'build') return () => ({});
      if (key === 'then') return undefined;
      if (key === 'toString') return Function.prototype.toString;
      if (key === 'valueOf') return Function.prototype.valueOf;
      return gestureBuilder();
    },
    apply: () => gestureBuilder(),
  });
}
const Gesture = {
  Pan: gestureBuilder, Tap: gestureBuilder, LongPress: gestureBuilder, Pinch: gestureBuilder,
  Rotation: gestureBuilder, Fling: gestureBuilder, Exclusive: gestureBuilder,
  Simultaneous: gestureBuilder, Race: gestureBuilder,
};

// react-native-reanimated
const useSharedValue = (initial) => ({ value: typeof initial === 'function' ? initial() : initial });
const useAnimatedStyle = (factory) => { try { return factory() || {}; } catch { return {}; } };
const useDerivedValue = (factory) => { try { return { value: factory() }; } catch { return { value: undefined }; } };
const useAnimatedScrollHandler = (handler) => handler || {};
const useAnimatedRef = () => ({ current: null });
const useAnimatedReaction = () => undefined;
const useAnimatedProps = () => ({});
const useWorkletCallback = (fn) => fn;
const useEvent = () => undefined;
const withTiming = (toValue) => toValue;
const withSpring = (toValue) => toValue;
const withDelay = (_delay, value) => (typeof value === 'function' ? value() : value);
const withSequence = function () { const args = [].slice.call(arguments); return args.length ? args[args.length - 1] : undefined; };
const withRepeat = (value) => (typeof value === 'function' ? value() : value);
const withDecay = () => 0;
const cancelAnimation = noop;
const runOnJS = (fn) => fn;
const runOnUI = (fn) => fn;
const isWorklet = () => false;
function interpolate(x, input, output) {
  if (!Array.isArray(input) || !Array.isArray(output) || input.length < 2 || output.length < 2) return x;
  if (x <= input[0]) return output[0];
  if (x >= input[input.length - 1]) return output[output.length - 1];
  for (let i = 1; i < input.length; i++) {
    if (x <= input[i]) {
      const span = input[i] - input[i - 1];
      const t = span === 0 ? 0 : (x - input[i - 1]) / span;
      return output[i - 1] + (output[i] - output[i - 1]) * t;
    }
  }
  return output[output.length - 1];
}
const interpolateColor = () => '#000000';
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const Extrapolation = { EXTEND: 'extend', CLAMP: 'clamp', IDENTITY: 'identity' };
const Extrapolate = Extrapolation;
const ease = (v) => v;
const Easing = {
  linear: ease, ease, quad: ease, cubic: ease, circle: ease, sin: ease, exp: ease,
  in: ease, out: ease, inOut: ease, poly: () => ease, bezier: () => ease,
  back: () => ease, bounce: () => ease, elastic: () => ease, steps: () => ease,
};
function transitionBuilder() {
  // Entering/exiting/layout presets: callable AND chainable (.duration, .delay,
  // .springify, ...) so both entering={FadeIn} and entering={FadeIn.duration(300)}
  // work; the resulting config is only ever a prop on the element.
  const builder = () => ({});
  builder.duration = () => builder; builder.delay = () => builder; builder.springify = () => builder;
  builder.timing = () => builder; builder.easing = () => builder; builder.mass = () => builder;
  builder.damping = () => builder; builder.stiffness = () => builder; builder.withInitialValues = () => builder;
  return builder;
}
const FadeIn = transitionBuilder(), FadeOut = transitionBuilder();
const FadeInDown = transitionBuilder(), FadeInUp = transitionBuilder(), FadeInLeft = transitionBuilder(), FadeInRight = transitionBuilder();
const FadeOutDown = transitionBuilder(), FadeOutUp = transitionBuilder(), FadeOutLeft = transitionBuilder(), FadeOutRight = transitionBuilder();
const SlideInDown = transitionBuilder(), SlideInUp = transitionBuilder(), SlideInLeft = transitionBuilder(), SlideInRight = transitionBuilder();
const SlideOutDown = transitionBuilder(), SlideOutUp = transitionBuilder(), SlideOutLeft = transitionBuilder(), SlideOutRight = transitionBuilder();
const ZoomIn = transitionBuilder(), ZoomOut = transitionBuilder(), ZoomInEasyDown = transitionBuilder(), ZoomOutEasyDown = transitionBuilder();
const BounceIn = transitionBuilder(), BounceOut = transitionBuilder(), BounceInDown = transitionBuilder(), BounceOutDown = transitionBuilder();
const LightSpeedIn = transitionBuilder(), LightSpeedOut = transitionBuilder();
const StretchInX = transitionBuilder(), StretchInY = transitionBuilder(), StretchOutX = transitionBuilder(), StretchOutY = transitionBuilder();
const Layout = transitionBuilder(), LinearTransition = transitionBuilder(), FadingTransition = transitionBuilder(),
  SequencedTransition = transitionBuilder(), JumpingTransition = transitionBuilder(), CurvedTransition = transitionBuilder();
const Animated = {
  View: host('Animated.View'), Text: host('Animated.Text'), Image: host('Animated.Image'),
  ScrollView: host('Animated.ScrollView'), FlatList: host('Animated.FlatList'),
  createAnimatedComponent: (comp) => comp,
};

// expo-font — fonts report loaded synchronously so useFonts gates render their
// children instead of hanging on a promise.
const FontDisplay = { AUTO: 'auto', BLOCK: 'block', SWAP: 'swap', FALLBACK: 'fallback', OPTIONAL: 'optional' };
const Font = { loadAsync: () => Promise.resolve(), isLoaded: () => true, isLoading: () => false, getLoadedFonts: () => [], getUsedFonts: () => [] };
function useFonts() { return [true, null]; }
function loadAsync() { return Promise.resolve(); }
function isLoaded() { return true; }
function isLoading() { return false; }

// react-native-screens
const enableScreens = noop;
const enableFreeze = noop;
const Screen = host('Screen'), ScreenContainer = host('ScreenContainer'), ScreenStack = host('ScreenStack');

// expo-linear-gradient
const LinearGradient = host('LinearGradient');

// expo-constants (default-only import)
const Constants = {
  platform: { ios: { statusBarHeight: 0 }, android: {} }, statusBarHeight: 0, isDevice: false,
  expoConfig: null, manifest: null, appOwnership: null, sessionId: '', expoVersion: '49.0.0',
  executionEnvironment: 'storeClient', linkingUri: '',
};

// @expo/vector-icons — icon components render as host nodes carrying their
// name/size props (real glyphs need the font + native renderer).
const Ionicons = host('Ionicons'), MaterialIcons = host('MaterialIcons'), FontAwesome = host('FontAwesome'),
  Feather = host('Feather'), Entypo = host('Entypo'), AntDesign = host('AntDesign'),
  MaterialCommunityIcons = host('MaterialCommunityIcons'), Octicons = host('Octicons'),
  SimpleLineIcons = host('SimpleLineIcons'), EvilIcons = host('EvilIcons'), Foundation = host('Foundation'),
  Fontisto = host('Fontisto'), Zocial = host('Zocial');
const createIconSet = () => host('Icon'), createIconSetFromFontello = () => host('Icon'), createIconSetFromIonicons = () => host('Icon');

// expo — the umbrella package. The Expo entry wrapper (index.js) side-effect
// imports 'expo', and generated code pulls registerRootComponent / legacy
// re-exports (Constants, Font) / a few async helpers — all inert here.
const registerRootComponent = (comp) => comp;
const Asset = { fromModule: (m) => ({ uri: String(m), downloadAsync: () => Promise.resolve() }) };
const SplashScreen = { preventAutoHideAsync: () => Promise.resolve(), hideAsync: () => Promise.resolve(), setOptions: noop };
const Updates = { reloadAsync: () => Promise.resolve(), checkForUpdateAsync: () => Promise.resolve(), fetchUpdateAsync: () => Promise.resolve() };
const Linking = { openURL: () => Promise.resolve(), canOpenURL: () => Promise.resolve(true), addEventListener: () => ({ remove: noop }) };
const Device = { isDevice: false, brand: null, modelName: null, osName: 'ios', osVersion: '0' };

// expo-router — file-based routing surface for app-router projects. Layout
// files render their <Stack>/<Tabs> + <Screen> config children as host nodes
// (the actual route files are discovered by convention, not imports, so a
// layout entry shows its navigator structure); Link/Redirect render as host
// nodes; the router singleton and hooks (useRouter / useLocalSearchParams /
// useSegments / usePathname) return inert values real screen bodies can read
// without throwing. Subpath imports (expo-router/stack, /tabs, /link) alias
// to this same namespace, so every re-export resolves here too.
const Stack = host('Stack');
Stack.Screen = host('Stack.Screen');
Stack.Protected = host('Stack.Protected');
const Tabs = host('Tabs');
Tabs.Screen = host('Tabs.Screen');
Tabs.Protected = host('Tabs.Protected');
const Link = host('Link');
const Redirect = host('Redirect');
const Slot = passthrough;
const ExpoRoot = passthrough;
const router = {
  push: noop, replace: noop, back: noop, navigate: noop, dismiss: noop,
  dismissAll: noop, dismissTo: noop, canGoBack: () => false, setParams: noop,
  reload: noop, prefetch: noop, getState: () => ({}),
  asPath: '/', pathname: '/', segments: [], query: {},
};
const useRouter = () => router;
const useLocalSearchParams = () => ({});
const useGlobalSearchParams = () => ({});
const useSegments = () => [];
const usePathname = () => '/';
const useRootNavigationState = () => ({ key: 'root', index: 0, routes: [], routeNames: [] });
const useNavigationContainerRef = () => ({ current: Object.assign({}, noopNavigation, { getRootState: () => ({}) }) });
const withLayoutContext = (Navigator) => Navigator;

module.exports = {
  __esModule: true,
  createElement,
  jsx, jsxs, jsxDEV,
  Fragment,
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  useContext,
  createContext,
  renderToJson,
  // react-native surface
  View, Text, ScrollView, Image, TextInput, Pressable, TouchableOpacity, TouchableHighlight,
  SafeAreaView, Modal, ActivityIndicator, FlatList, SectionList, KeyboardAvoidingView, StatusBar, Switch,
  StyleSheet, Platform, Dimensions,
  // expo-status-bar surface
  setStatusBarStyle, setStatusBarHidden, setStatusBarNetworkActivityIndicatorVisible, setStatusBarTranslucent, setStatusBarBackgroundColor,
  // expo umbrella surface
  registerRootComponent, Asset, SplashScreen, Updates, Linking, Device,
  // expo-router surface
  Stack, Tabs, Link, Redirect, Slot, ExpoRoot, router,
  useRouter, useLocalSearchParams, useGlobalSearchParams, useSegments, usePathname,
  useRootNavigationState, useNavigationContainerRef, withLayoutContext,
  // react-native-safe-area-context surface
  SafeAreaProvider, useSafeAreaInsets, initialWindowMetrics: null,
  // @react-navigation/native surface
  NavigationContainer, useNavigation: () => noopNavigation, useRoute: () => safeRoute('unknown'), useIsFocused: () => true, useFocusEffect: noop,
  // @react-navigation/native-stack surface
  createNativeStackNavigator,
  // react-native-gesture-handler surface
  GestureHandlerRootView, GestureDetector, Gesture, State, Directions,
  PanGestureHandler: host('PanGestureHandler'), TapGestureHandler: host('TapGestureHandler'),
  LongPressGestureHandler: host('LongPressGestureHandler'), PinchGestureHandler: host('PinchGestureHandler'),
  RotationGestureHandler: host('RotationGestureHandler'), FlingGestureHandler: host('FlingGestureHandler'),
  NativeViewGestureHandler: host('NativeViewGestureHandler'), ForceTouchGestureHandler: host('ForceTouchGestureHandler'),
  RectButton: host('RectButton'), BorderlessButton: host('BorderlessButton'), BaseButton: host('BaseButton'), PureNativeButton: host('PureNativeButton'),
  gestureHandlerRootHOC: (comp) => comp, createNativeWrapper: (comp) => comp,
  enableExperimentalWebImplementation: noop, enableLegacyWebImplementation: noop,
  // react-native-reanimated surface
  Animated,
  useSharedValue, useAnimatedStyle, useDerivedValue, useAnimatedScrollHandler, useAnimatedRef,
  useAnimatedReaction, useAnimatedProps, useWorkletCallback, useEvent,
  withTiming, withSpring, withDelay, withSequence, withRepeat, withDecay, cancelAnimation,
  runOnJS, runOnUI, isWorklet, interpolate, interpolateColor, clamp, Easing, Extrapolation, Extrapolate,
  FadeIn, FadeOut, FadeInDown, FadeInUp, FadeInLeft, FadeInRight,
  FadeOutDown, FadeOutUp, FadeOutLeft, FadeOutRight,
  SlideInDown, SlideInUp, SlideInLeft, SlideInRight,
  SlideOutDown, SlideOutUp, SlideOutLeft, SlideOutRight,
  ZoomIn, ZoomOut, ZoomInEasyDown, ZoomOutEasyDown,
  BounceIn, BounceOut, BounceInDown, BounceOutDown,
  LightSpeedIn, LightSpeedOut, StretchInX, StretchInY, StretchOutX, StretchOutY,
  Layout, LinearTransition, FadingTransition, SequencedTransition, JumpingTransition, CurvedTransition,
  // expo-font surface
  useFonts, loadAsync, Font, FontDisplay, isLoaded, isLoading,
  // react-native-screens surface
  enableScreens, enableFreeze, Screen, ScreenContainer, ScreenStack,
  // expo-linear-gradient surface
  LinearGradient,
  // expo-constants surface
  Constants,
  // @expo/vector-icons surface
  Ionicons, MaterialIcons, FontAwesome, Feather, Entypo, AntDesign, MaterialCommunityIcons,
  Octicons, SimpleLineIcons, EvilIcons, Foundation, Fontisto, Zocial,
  createIconSet, createIconSetFromFontello, createIconSetFromIonicons,
  default: {
    createElement, Fragment, useState, useEffect, useMemo, useCallback, useRef, useContext, createContext, jsx, jsxs,
    // reanimated's default export is 'Animated' — its host components land
    // here so import Animated from 'react-native-reanimated' yields
    // Animated.View etc. without colliding with the named RN hosts.
    View: host('Animated.View'), Text: host('Animated.Text'), Image: host('Animated.Image'),
    ScrollView: host('Animated.ScrollView'), FlatList: host('Animated.FlatList'),
    createAnimatedComponent: (comp) => comp,
    // expo-constants is default-only — its common fields ride along too.
    platform: Constants.platform, statusBarHeight: 0, isDevice: false,
    expoConfig: null, manifest: null, appOwnership: null, sessionId: '', expoVersion: '49.0.0',
    executionEnvironment: 'storeClient', linkingUri: '',
  },
};
`
