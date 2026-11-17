import { cleanup } from '@testing-library/react';

import '@testing-library/jest-dom/vitest';
import { Buffer } from 'node:buffer';
import { afterAll, afterEach, beforeAll } from 'vitest';

import { server } from './mocks/server';

// Fix cross-realm Uint8Array instance checks in jsdom
if (typeof Uint8Array !== 'undefined') {
  try {
    Object.defineProperty(Uint8Array, Symbol.hasInstance, {
      value: function (inst: any) {
        return (
          inst !== null &&
          typeof inst === 'object' &&
          (inst.constructor?.name === 'Uint8Array' ||
            Object.prototype.toString.call(inst) === '[object Uint8Array]' ||
            (typeof Buffer !== 'undefined' && Buffer.isBuffer?.(inst)))
        );
      },
      configurable: true,
    });
  } catch {
    // Ignore if Symbol.hasInstance cannot be overridden
  }
}

// Polyfill global and Buffer for the testing environment
if (typeof globalThis !== 'undefined') {
  (globalThis as any).Buffer = (globalThis as any).Buffer || Buffer;
  (globalThis as any).Uint8Array = Uint8Array;
  (globalThis as any).ArrayBuffer = ArrayBuffer;
  (globalThis as any).localStorage = (globalThis as any).localStorage || {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
  };
}
if (typeof window !== 'undefined') {
  (window as any).Buffer = (window as any).Buffer || Buffer;
  (window as any).Uint8Array = Uint8Array;
  (window as any).ArrayBuffer = ArrayBuffer;
  (window as any).global = (window as any).global || window;
  window.matchMedia =
    window.matchMedia ||
    function () {
      return {
        matches: false,
        addListener: function () {},
        removeListener: function () {},
        addEventListener: function () {},
        removeEventListener: function () {},
        dispatchEvent: function () {
          return false;
        },
      };
    };
}
if (typeof global !== 'undefined') {
  (global as any).Buffer = (global as any).Buffer || Buffer;
}

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'warn' });
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});
