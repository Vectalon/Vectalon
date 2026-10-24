import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import App from '../../App';

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);

it('drives the disposable probe through the actual session hook', async () => {
  await render(<App />);
  expect(screen.getByText('Current sessions: 1')).toBeTruthy();
  expect(screen.getByText('Other sessions: 2')).toBeTruthy();
  expect(screen.getByText('Two factor: off')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Try current and unknown IDs'));
  expect(screen.getByText('Current sessions: 1')).toBeTruthy();
  expect(screen.getByText('Other sessions: 2')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Revoke other sessions'));
  expect(screen.getByText('Current sessions: 1')).toBeTruthy();
  expect(screen.getByText('Other sessions: 0')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Revoke other sessions'));
  await fireEvent.press(screen.getByLabelText('Try current and unknown IDs'));
  expect(screen.getByText('Current sessions: 1')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Toggle two factor'));
  expect(screen.getByText('Two factor: on')).toBeTruthy();
  expect(screen.getByText('Current sessions: 1')).toBeTruthy();
  expect(screen.getByText('Other sessions: 0')).toBeTruthy();
});
