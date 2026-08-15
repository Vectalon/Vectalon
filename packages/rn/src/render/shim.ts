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
  // react-native-safe-area-context surface
  SafeAreaProvider, useSafeAreaInsets, initialWindowMetrics: null,
  // @react-navigation/native surface
  NavigationContainer, useNavigation: () => noopNavigation, useRoute: () => safeRoute('unknown'), useIsFocused: () => true, useFocusEffect: noop,
  // @react-navigation/native-stack surface
  createNativeStackNavigator,
  default: { createElement, Fragment, useState, useEffect, useMemo, useCallback, useRef, useContext, createContext, jsx, jsxs },
};
`
