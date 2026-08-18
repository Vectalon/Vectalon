/**
 * React Native — framework profile definition
 * Business Source License 1.1 (BSL-1.1)
 *
 * Extends React with mobile-specific lifecycle, rules and pitfalls.
 * The `inherits: 'react'` field means the registry resolves the full
 * rule chain: [typescript rules] + [react rules] + [react-native rules].
 *
 * Register into a FrameworkProfileRegistry:
 *   registry.register(reactNativeDefinition, 'rn')
 */
import type { FrameworkProfile } from '../types';
export declare const reactNativeDefinition: FrameworkProfile;
