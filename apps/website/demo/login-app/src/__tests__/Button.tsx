import React from 'react';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';
import { Button } from '../components/ui';

function luminance(hex: string) {
  const rgb = hex.slice(1).match(/../g)!.map(channel => {
    const value = parseInt(channel, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

it('secondary button text has sufficient contrast against its rendered background', async () => {
  const { getByText, getByRole } = await render(<Button label="Continue" variant="secondary" onPress={() => {}} />);
  const foreground = luminance(StyleSheet.flatten(getByText('Continue').props.style).color);
  const background = luminance(StyleSheet.flatten(getByRole('button').props.style).backgroundColor);
  expect((Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05)).toBeGreaterThanOrEqual(4.5);
});
