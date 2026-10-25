import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import App from '../../App';

it('exposes the real service isolation outcome through the probe UI', async () => {
  const screen = await render(<App />);
  expect(screen.getByText('Isolation: not run')).toBeTruthy();
  await act(async () => { fireEvent.press(screen.getByLabelText('Check catalog isolation')); });
  expect(screen.getByText('Isolation: PASS')).toBeTruthy();
  for (const check of ['Independent objects', 'Second result unchanged', 'Next get unchanged', 'Catalog list unchanged', 'Category list unchanged', 'Unknown ID returns null']) {
    expect(screen.getByText(`${check}: PASS`)).toBeTruthy();
  }
});
