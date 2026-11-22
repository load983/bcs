import assert from 'node:assert/strict';
import test from 'node:test';
import { getStoredItem, removeStoredItem, setStoredItem } from './safeStorage.js';

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
function setWindow(value) {
  Object.defineProperty(globalThis, 'window', { configurable: true, value });
}
function restoreWindow() {
  if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
  else delete globalThis.window;
}

test('storage helpers treat an unavailable browser storage area as empty and non-fatal', () => {
  setWindow({ get localStorage() { throw new DOMException('Blocked', 'SecurityError'); } });
  assert.equal(getStoredItem('token'), null);
  assert.doesNotThrow(() => setStoredItem('token', 'secret'));
  assert.doesNotThrow(() => removeStoredItem('token'));
  restoreWindow();
});

test('storage helpers persist values when localStorage is available', () => {
  const values = new Map();
  setWindow({ localStorage: {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  } });
  setStoredItem('token', 'abc');
  assert.equal(getStoredItem('token'), 'abc');
  removeStoredItem('token');
  assert.equal(getStoredItem('token'), null);
  restoreWindow();
});
