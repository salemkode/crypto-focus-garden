/**
 * Runtime polyfills required by @bitauth/libauth, @xo-cash/* and @electrum-cash/*
 * on Hermes. Each one is installed only when the runtime lacks (or has a
 * non-conforming) implementation. Import this module once, before anything else.
 */
import Native from './LibauthNativeModule';

type AnyGlobal = typeof globalThis & Record<string, any>;
const g = globalThis as AnyGlobal;

// -------------------------------------------------- crypto.getRandomValues
// libauth's `generateRandomBytes`/`generatePrivateKey` read the global `crypto`.

const MAX_RANDOM_BYTES = 65536;

const getRandomValues = <T extends ArrayBufferView | null>(array: T): T => {
  if (
    !(
      array instanceof Int8Array ||
      array instanceof Uint8Array ||
      array instanceof Uint8ClampedArray ||
      array instanceof Int16Array ||
      array instanceof Uint16Array ||
      array instanceof Int32Array ||
      array instanceof Uint32Array ||
      (typeof BigInt64Array !== 'undefined' && array instanceof BigInt64Array) ||
      (typeof BigUint64Array !== 'undefined' && array instanceof BigUint64Array)
    )
  ) {
    throw new TypeError("Failed to execute 'getRandomValues' on 'Crypto': The provided value is not an integer typed array.");
  }
  if (array.byteLength > MAX_RANDOM_BYTES) {
    const error = new Error(
      `Failed to execute 'getRandomValues' on 'Crypto': The ArrayBufferView's byte length (${array.byteLength}) exceeds the number of bytes of entropy available via this API (${MAX_RANDOM_BYTES}).`
    );
    error.name = 'QuotaExceededError';
    throw error;
  }
  const bytes = Native.randomBytes(array.byteLength);
  new Uint8Array(array.buffer, array.byteOffset, array.byteLength).set(bytes);
  return array;
};

const randomUUID = (): `${string}-${string}-${string}-${string}-${string}` => {
  const bytes = Native.randomBytes(16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}` as const;
};

if (typeof g.crypto !== 'object' || g.crypto === null) {
  Object.defineProperty(g, 'crypto', {
    configurable: true,
    enumerable: true,
    value: { getRandomValues, randomUUID },
    writable: true,
  });
} else {
  if (typeof g.crypto.getRandomValues !== 'function') g.crypto.getRandomValues = getRandomValues;
  if (typeof g.crypto.randomUUID !== 'function') g.crypto.randomUUID = randomUUID;
}

// ----------------------------------------------------------- AbortSignal

const createAbortError = () => {
  const error = new Error('This operation was aborted');
  error.name = 'AbortError';
  return error;
};
const createTimeoutError = () => {
  const error = new Error('The operation was aborted due to timeout');
  error.name = 'TimeoutError';
  return error;
};

if (typeof g.AbortController === 'function' && typeof g.AbortSignal === 'function') {
  const AbortControllerImpl = g.AbortController as typeof AbortController;
  const AbortSignalImpl = g.AbortSignal as typeof AbortSignal & Record<string, any>;

  // `signal.reason` (used by @xo-cash/utils' ExponentialBackoff).
  const probe = new AbortControllerImpl();
  const probeReason = {};
  probe.abort(probeReason);
  if (probe.signal.reason !== probeReason) {
    const originalAbort = AbortControllerImpl.prototype.abort;
    AbortControllerImpl.prototype.abort = function abort(this: AbortController, reason?: unknown) {
      if (!this.signal.aborted) {
        Object.defineProperty(this.signal, 'reason', {
          configurable: true,
          enumerable: true,
          value: reason === undefined ? createAbortError() : reason,
          writable: false,
        });
      }
      return originalAbort.call(this);
    };
  }

  if (typeof AbortSignalImpl.prototype.throwIfAborted !== 'function') {
    AbortSignalImpl.prototype.throwIfAborted = function throwIfAborted(this: AbortSignal) {
      if (this.aborted) throw this.reason ?? createAbortError();
    };
  }

  if (typeof AbortSignalImpl.abort !== 'function') {
    AbortSignalImpl.abort = (reason?: unknown) => {
      const controller = new AbortControllerImpl();
      controller.abort(reason);
      return controller.signal;
    };
  }

  if (typeof AbortSignalImpl.timeout !== 'function') {
    AbortSignalImpl.timeout = (milliseconds: number) => {
      const controller = new AbortControllerImpl();
      setTimeout(() => controller.abort(createTimeoutError()), milliseconds);
      return controller.signal;
    };
  }

  // `AbortSignal.any` (used by @xo-cash/utils).
  if (typeof AbortSignalImpl.any !== 'function') {
    AbortSignalImpl.any = (signals: Iterable<AbortSignal>) => {
      const controller = new AbortControllerImpl();
      const sources = Array.from(signals);
      const aborted = sources.find((signal) => signal.aborted);
      if (aborted !== undefined) {
        controller.abort(aborted.reason);
        return controller.signal;
      }
      const listeners: Array<() => void> = [];
      const cleanup = () => {
        sources.forEach((signal, index) => signal.removeEventListener('abort', listeners[index]!));
      };
      sources.forEach((signal) => {
        const listener = () => {
          cleanup();
          controller.abort(signal.reason);
        };
        listeners.push(listener);
        signal.addEventListener('abort', listener);
      });
      return controller.signal;
    };
  }
}

// ------------------------------------------------------------ TextDecoder
// @xo-cash/utils decodes Electrum JSON streams with `decode(chunk, { stream: true })`.

class Utf8TextDecoder {
  readonly encoding = 'utf-8';
  readonly fatal: boolean;
  readonly ignoreBOM: boolean;
  #pending: number[] = [];
  #seenBOMCheck = false;

  constructor(label = 'utf-8', options: { fatal?: boolean; ignoreBOM?: boolean } = {}) {
    const normalized = String(label).trim().toLowerCase();
    if (normalized !== 'utf-8' && normalized !== 'utf8' && normalized !== 'unicode-1-1-utf-8') {
      throw new RangeError(`The encoding label provided ('${label}') is invalid.`);
    }
    this.fatal = Boolean(options.fatal);
    this.ignoreBOM = Boolean(options.ignoreBOM);
  }

  decode(input?: ArrayBuffer | ArrayBufferView, options: { stream?: boolean } = {}): string {
    let bytes: Uint8Array;
    if (input === undefined || input === null) bytes = new Uint8Array(0);
    else if (input instanceof ArrayBuffer) bytes = new Uint8Array(input);
    else if (ArrayBuffer.isView(input)) bytes = new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    else throw new TypeError("Failed to execute 'decode' on 'TextDecoder': parameter 1 is not of type 'ArrayBuffer'.");

    const data = this.#pending.length ? Uint8Array.from([...this.#pending, ...bytes]) : bytes;
    this.#pending = [];
    const stream = Boolean(options.stream);
    const codeUnits: number[] = [];
    let out = '';
    let i = 0;
    const replacement = () => {
      if (this.fatal) {
        this.#pending = [];
        this.#seenBOMCheck = false;
        throw new TypeError("Failed to execute 'decode' on 'TextDecoder': The encoded data was not valid.");
      }
      codeUnits.push(0xfffd);
    };

    while (i < data.length) {
      const byte = data[i]!;
      let needed = 0;
      let codePoint = 0;
      let lower = 0x80;
      let upper = 0xbf;
      if (byte <= 0x7f) {
        codeUnits.push(byte);
        i += 1;
      } else {
        if (byte >= 0xc2 && byte <= 0xdf) {
          needed = 1;
          codePoint = byte & 0x1f;
        } else if (byte >= 0xe0 && byte <= 0xef) {
          if (byte === 0xe0) lower = 0xa0;
          if (byte === 0xed) upper = 0x9f;
          needed = 2;
          codePoint = byte & 0x0f;
        } else if (byte >= 0xf0 && byte <= 0xf4) {
          if (byte === 0xf0) lower = 0x90;
          if (byte === 0xf4) upper = 0x8f;
          needed = 3;
          codePoint = byte & 0x07;
        } else {
          replacement();
          i += 1;
          continue;
        }
        let j = 1;
        let valid = true;
        for (; j <= needed; j++) {
          if (i + j >= data.length) break;
          const next = data[i + j]!;
          const lo = j === 1 ? lower : 0x80;
          const hi = j === 1 ? upper : 0xbf;
          if (next < lo || next > hi) {
            valid = false;
            break;
          }
          codePoint = (codePoint << 6) | (next & 0x3f);
        }
        if (valid && j <= needed) {
          // Truncated sequence at the end of the input.
          if (stream) {
            this.#pending = Array.from(data.subarray(i));
            break;
          }
          replacement();
          i = data.length;
          continue;
        }
        if (!valid) {
          replacement();
          i += j;
          continue;
        }
        if (codePoint > 0xffff) {
          codePoint -= 0x10000;
          codeUnits.push(0xd800 + (codePoint >> 10), 0xdc00 + (codePoint & 0x3ff));
        } else {
          codeUnits.push(codePoint);
        }
        i += needed + 1;
      }
      if (codeUnits.length >= 8192) {
        out += String.fromCharCode(...codeUnits.splice(0));
      }
    }
    out += String.fromCharCode(...codeUnits);

    if (!this.#seenBOMCheck && out.length > 0) {
      this.#seenBOMCheck = true;
      if (!this.ignoreBOM && out.charCodeAt(0) === 0xfeff) out = out.slice(1);
    }
    if (!stream) {
      this.#seenBOMCheck = false;
      this.#pending = [];
    }
    return out;
  }
}

const textDecoderSupportsStreaming = (() => {
  if (typeof g.TextDecoder !== 'function') return false;
  try {
    const decoder = new g.TextDecoder();
    // "€" (E2 82 AC) split across two chunks.
    const result = decoder.decode(new Uint8Array([0xe2, 0x82]), { stream: true }) + decoder.decode(new Uint8Array([0xac]));
    return result === '€';
  } catch {
    return false;
  }
})();

if (!textDecoderSupportsStreaming) {
  g.TextDecoder = Utf8TextDecoder;
}

// ---------------------------------------------------------- String.matchAll
// Hermes' native `matchAll` returns matches without `.groups` for named capture
// groups (`exec`/`match`/`replace` are fine). @electrum-cash/protocol parses server
// versions with `matchAll` + named groups, so every Electrum server was rejected.
// Replace it with a spec-compliant implementation built on `RegExp#exec`.

const matchAllSupportsNamedGroups = (() => {
  try {
    return '1'.matchAll(/(?<digit>1)/g).next().value?.groups?.digit === '1';
  } catch {
    return false;
  }
})();

if (!matchAllSupportsNamedGroups) {
  const MAX_SAFE_LENGTH = Number.MAX_SAFE_INTEGER;
  const toLength = (value: unknown) => {
    const number = Math.trunc(Number(value));
    if (!Number.isFinite(number) || number <= 0) return 0;
    return Math.min(number, MAX_SAFE_LENGTH);
  };
  const advanceStringIndex = (string: string, index: number, unicode: boolean) => {
    if (!unicode || index + 1 >= string.length) return index + 1;
    const first = string.charCodeAt(index);
    if (first < 0xd800 || first > 0xdbff) return index + 1;
    const second = string.charCodeAt(index + 1);
    return second < 0xdc00 || second > 0xdfff ? index + 1 : index + 2;
  };
  const isRegExp = (value: unknown): value is RegExp => {
    if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return false;
    const matcher = (value as any)[Symbol.match];
    return matcher !== undefined ? Boolean(matcher) : value instanceof RegExp;
  };

  function* regExpStringIterator(matcher: RegExp, string: string, global: boolean, fullUnicode: boolean) {
    while (true) {
      const match = matcher.exec(string);
      if (match === null) return;
      if (!global) {
        yield match;
        return;
      }
      if (String(match[0]) === '') {
        matcher.lastIndex = advanceStringIndex(string, toLength(matcher.lastIndex), fullUnicode);
      }
      yield match;
    }
  }

  const regExpMatchAll = function (this: RegExp, input: unknown) {
    const string = String(input);
    const species = (this.constructor as any)?.[Symbol.species];
    const Constructor: RegExpConstructor = typeof species === 'function' ? species : RegExp;
    const flags = String(this.flags);
    const matcher = new Constructor(this, flags);
    matcher.lastIndex = toLength(this.lastIndex);
    return regExpStringIterator(matcher, string, flags.includes('g'), flags.includes('u') || flags.includes('v'));
  };

  Object.defineProperty(RegExp.prototype, Symbol.matchAll, {
    configurable: true,
    value: regExpMatchAll,
    writable: true,
  });

  Object.defineProperty(String.prototype, 'matchAll', {
    configurable: true,
    value: function matchAll(this: unknown, regexp: unknown) {
      if (this === null || this === undefined) {
        throw new TypeError('String.prototype.matchAll called on null or undefined');
      }
      if (regexp !== null && regexp !== undefined) {
        if (isRegExp(regexp) && !String((regexp as RegExp).flags).includes('g')) {
          throw new TypeError('String.prototype.matchAll called with a non-global RegExp argument');
        }
        const matcher = (regexp as any)[Symbol.matchAll];
        if (matcher !== undefined && matcher !== null) return matcher.call(regexp, String(this));
      }
      return regExpMatchAll.call(new RegExp(regexp as string, 'g'), String(this));
    },
    writable: true,
  });
}

// ------------------------------------------------- window.addEventListener
// React Native defines `window` (the global object) but not its EventTarget
// methods. @electrum-cash/web-socket sees `typeof window !== "undefined"` and calls
// `window.addEventListener('online' | 'offline', …)` at the start of every connect(),
// which throws, so Electrum clients never connect. Provide a minimal EventTarget.

if (typeof g.window === 'object' && g.window !== null && typeof g.window.addEventListener !== 'function') {
  type Listener = ((event: unknown) => void) | { handleEvent(event: unknown): void };
  const listeners = new Map<string, Set<Listener>>();
  const target = g.window as unknown as Record<string, unknown>;
  target.addEventListener = (type: string, listener: Listener | null) => {
    if (!listener) return;
    let set = listeners.get(type);
    if (!set) listeners.set(type, (set = new Set()));
    set.add(listener);
  };
  target.removeEventListener = (type: string, listener: Listener | null) => {
    if (listener) listeners.get(type)?.delete(listener);
  };
  target.dispatchEvent = (event: { type: string }) => {
    for (const listener of [...(listeners.get(event.type) ?? [])]) {
      if (typeof listener === 'function') listener.call(target, event);
      else listener.handleEvent(event);
    }
    return true;
  };
}

// ------------------------------------------------------------ process.cwd

if (typeof g.process === 'object' && g.process !== null && typeof g.process.cwd !== 'function') {
  g.process.cwd = () => '/';
}

export {};
