// Browser storage can be disabled or throw (for example in sandboxed/private contexts).
// Treat unavailable storage as an empty, non-persistent session instead of crashing the app.
const getStorage = () => {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

export const getStoredItem = (key) => {
  try {
    return getStorage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
};

export const setStoredItem = (key, value) => {
  try {
    getStorage()?.setItem(key, value);
  } catch {
    // Authentication remains available for this page session even if persistence is blocked.
  }
};

export const removeStoredItem = (key) => {
  try {
    getStorage()?.removeItem(key);
  } catch {
    // A blocked storage area should not prevent logout or app startup.
  }
};
