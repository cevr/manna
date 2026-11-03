import { expect, test } from 'bun:test';
import installed from 'one/package.json';

import app from '../package.json';

test('the installed One is the exact version the app pins', () => {
  const pin = app.dependencies.one;
  expect(pin).toMatch(/^\d+\.\d+\.\d+$/);
  expect(installed.version).toBe(pin);
});
