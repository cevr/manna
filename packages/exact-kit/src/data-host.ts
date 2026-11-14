/** What a refused call throws inside `withDataHost`: Exact's own words, naming the call. */
export const refusal = (api: string) =>
  `${api} is unavailable in data sources; pass time or a random seed as an argument`;

const refuse = (api: string): never => {
  throw new Error(refusal(api));
};

/** The timers a data module has none of, as globals. */
const TIMERS = ['setInterval', 'requestAnimationFrame'] as const;

/** The globals one `withDataHost` replaced, as they were before it. */
interface Saved {
  readonly date: DateConstructor;
  readonly random: () => number;
  readonly performanceNow: () => number;
  readonly timers: ReadonlyArray<PropertyDescriptor | undefined>;
  readonly symbol: SymbolConstructor;
}

/** A `Date` that refuses the clock: `Date.now()`, `Date()` and a bare `new Date()`; a date from a value is a date. */
const guardedDate = (native: DateConstructor): DateConstructor => {
  function GuardedDate(this: unknown, ...args: Array<unknown>) {
    if (!new.target) return refuse('Date()');
    if (args.length === 0) return refuse('new Date()');
    return Reflect.construct(native, args, new.target);
  }
  GuardedDate.prototype = Object.create(native.prototype, {
    constructor: { value: GuardedDate, writable: true, configurable: true },
  });
  Object.defineProperties(GuardedDate, {
    now: { value: () => refuse('Date.now()') },
    UTC: { value: native.UTC },
    parse: { value: native.parse },
    name: { value: 'Date' },
    [Symbol.hasInstance]: { value: (value: unknown) => value instanceof native },
  });
  return GuardedDate as unknown as DateConstructor;
};

/** A `Symbol` without `dispose`, as Hermes has none: `Symbol.dispose` reads `undefined` and `'dispose' in Symbol` is false. */
const withoutDispose = (native: SymbolConstructor): SymbolConstructor => {
  const bare = (description?: string | number) => native(description);
  for (const key of Reflect.ownKeys(native)) {
    const descriptor = Object.getOwnPropertyDescriptor(native, key);
    if (key !== 'dispose' && key !== 'length' && key !== 'name' && descriptor)
      Object.defineProperty(bare, key, descriptor);
  }
  Object.defineProperty(bare, 'name', { value: 'Symbol' });
  return bare as unknown as SymbolConstructor;
};

const install = (): Saved => {
  const saved: Saved = {
    date: globalThis.Date,
    random: Math.random,
    performanceNow: performance.now,
    timers: TIMERS.map((name) => Object.getOwnPropertyDescriptor(globalThis, name)),
    symbol: globalThis.Symbol,
  };
  globalThis.Date = guardedDate(saved.date);
  Math.random = () => refuse('Math.random()');
  performance.now = () => refuse('performance.now()');
  for (const name of TIMERS)
    Object.defineProperty(globalThis, name, {
      value: () => refuse(`${name}()`),
      writable: true,
      configurable: true,
    });
  globalThis.Symbol = withoutDispose(saved.symbol);
  return saved;
};

const restore = (saved: Saved) => {
  globalThis.Symbol = saved.symbol;
  globalThis.Date = saved.date;
  Math.random = saved.random;
  performance.now = saved.performanceNow;
  TIMERS.forEach((name, i) => {
    const before = saved.timers[i];
    if (before) Object.defineProperty(globalThis, name, before);
    else Reflect.deleteProperty(globalThis, name);
  });
};

/**
 * `run` under the rules of Exact's data module, so a Bun test of a module `app.ts` imports fails
 * where Hermes would: inside it `Date.now()`, `Date()`, a bare `new Date()`, `Math.random()`,
 * `performance.now()`, `setInterval` and `requestAnimationFrame` throw, and `Symbol.dispose` is gone.
 * Every one is put back when `run` returns or throws; runs nest.
 */
export const withDataHost = <A>(run: () => A): A => {
  const saved = install();
  try {
    return run();
  } finally {
    restore(saved);
  }
};
