'use strict';

const MIN_TIMEOUT_MS = 20000;
const originalTimeout = AbortSignal.timeout;

AbortSignal.timeout = (ms) => {
  const value = typeof ms === 'number' ? ms : MIN_TIMEOUT_MS;
  const next = value >= 5000 ? Math.max(value, MIN_TIMEOUT_MS) : value;
  return originalTimeout(next);
};
