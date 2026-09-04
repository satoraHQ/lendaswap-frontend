import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clampConfirmations,
  DEFAULT_CONFIRMATIONS,
  MAX_CONFIRMATIONS,
  readStoredConfirmations,
  storeConfirmations,
  subscribeConfirmations,
} from "./bitcoinConfirmations";

describe("clampConfirmations", () => {
  it("keeps the value inside 0..MAX and truncates fractions", () => {
    expect(clampConfirmations(-3)).toBe(0);
    expect(clampConfirmations(2.9)).toBe(2);
    expect(clampConfirmations(MAX_CONFIRMATIONS + 10)).toBe(MAX_CONFIRMATIONS);
  });

  it("falls back to the default for NaN and infinities", () => {
    expect(clampConfirmations(Number.NaN)).toBe(DEFAULT_CONFIRMATIONS);
    expect(clampConfirmations(Number.POSITIVE_INFINITY)).toBe(
      DEFAULT_CONFIRMATIONS,
    );
  });
});

describe("readStoredConfirmations", () => {
  const store = new Map<string, string>();
  const fake = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  };
  let saved: unknown;

  beforeEach(() => {
    store.clear();
    saved = globalThis.localStorage;
    Object.defineProperty(globalThis, "localStorage", {
      value: fake,
      configurable: true,
    });
  });
  afterEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      value: saved,
      configurable: true,
    });
  });

  it("returns the default when nothing is stored", () => {
    expect(readStoredConfirmations()).toBe(DEFAULT_CONFIRMATIONS);
  });

  it("round-trips a stored choice and clamps a tampered one", () => {
    storeConfirmations(2);
    expect(readStoredConfirmations()).toBe(2);
    store.set("bitcoinMinConfirmations", "99");
    expect(readStoredConfirmations()).toBe(MAX_CONFIRMATIONS);
    store.set("bitcoinMinConfirmations", "garbage");
    expect(readStoredConfirmations()).toBe(DEFAULT_CONFIRMATIONS);
  });

  it("returns the default when storage throws", () => {
    Object.defineProperty(globalThis, "localStorage", {
      get() {
        throw new Error("blocked");
      },
      configurable: true,
    });
    expect(readStoredConfirmations()).toBe(DEFAULT_CONFIRMATIONS);
  });
});

describe("subscribeConfirmations", () => {
  it("fires on a local write and on another tab's write, then stops", () => {
    // Without the cross-tab half, each tab's SDK client keeps claiming at the
    // depth it was built with while the picker shows the new one.
    const store = new Map<string, string>();
    const savedStorage = Object.getOwnPropertyDescriptor(
      globalThis,
      "localStorage",
    );
    const savedWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
    const win = new EventTarget();
    Object.defineProperty(globalThis, "localStorage", {
      value: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
      },
      configurable: true,
    });
    Object.defineProperty(globalThis, "window", {
      value: win,
      configurable: true,
    });

    const otherTabWrote = (key: string) => {
      const event = new Event("storage") as Event & { key: string };
      event.key = key;
      win.dispatchEvent(event);
    };

    try {
      let fired = 0;
      const unsubscribe = subscribeConfirmations(() => {
        fired++;
      });

      storeConfirmations(2);
      expect(fired).toBe(1);

      otherTabWrote("bitcoinMinConfirmations");
      expect(fired).toBe(2);

      otherTabWrote("theme");
      expect(fired).toBe(2);

      unsubscribe();
      storeConfirmations(3);
      otherTabWrote("bitcoinMinConfirmations");
      expect(fired).toBe(2);
    } finally {
      if (savedStorage)
        Object.defineProperty(globalThis, "localStorage", savedStorage);
      if (savedWindow) Object.defineProperty(globalThis, "window", savedWindow);
      else Reflect.deleteProperty(globalThis, "window");
    }
  });
});
