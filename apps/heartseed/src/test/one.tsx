/* oxlint-disable effect/noNullish, effect/noThrowStatement, effect/noNewError -- the stand-in answers as One's synchronous store does: a listed key with no value is null, and a call that fails throws. */

/**
 * `one` as the app's tests see it: a phone's safe area with no insets, its
 * haptics (felt by nothing), its device info (a phone, not the simulator),
 * and its key-value database (`device`, below). `setup.ts` stands this
 * module in for `one`, the router's boundary, with the parts the screens use.
 */
export const useSafeAreaInsets = () => ({ top: 0, right: 0, bottom: 0, left: 0 });

type Method = 'open' | 'keys' | 'get' | 'set';

/** Where a read attempt fails: at its open, at its listing, or at its `nth` record read (1-based, counted from the attempt's listing); `ok` fails nothing. */
export type AttemptFault =
  | { readonly at: 'ok' }
  | { readonly at: 'open' }
  | { readonly at: 'keys' }
  | { readonly at: 'get'; readonly nth: number };

interface Device {
  disk: Map<string, string | null>;
  readonly names: Set<string>;
  failing: Record<Method, number>;
  reads: ReadonlyArray<AttemptFault>;
  calls: Record<Method | 'remove' | 'clear' | 'close' | 'failedOpens' | 'getsSinceListing', number>;
  readonly launch: (disk?: Iterable<readonly [string, string | null]>) => Device;
  readonly fail: (method: Method, times: number) => Device;
  readonly script: (reads: ReadonlyArray<AttemptFault>) => Device;
}

const noCalls = () => ({
  open: 0,
  keys: 0,
  get: 0,
  set: 0,
  remove: 0,
  clear: 0,
  close: 0,
  failedOpens: 0,
  getsSinceListing: 0,
});

/**
 * The reader's device as `One.Database` shows it to the app: a disk that
 * outlives every launch (a key listed with no value is `null`), the calls
 * each method has taken (and the handles closed), how many of its next
 * calls fail, and a read script. `launch` starts a test over a disk; a
 * failing call throws as One's store throws.
 *
 * The read script fails read attempts the way a device would fail them,
 * whatever the garden's retry: attempt `i` (from 0) is the number of failed
 * opens and listings so far, and `reads[i]` fails that attempt at its open
 * (only while the store is not open), its listing, or its nth record read
 * after the listing, possibly after good reads. Past the script, nothing
 * fails by it.
 */
export const device: Device = {
  disk: new Map<string, string | null>(),
  names: new Set<string>(),
  failing: { open: 0, keys: 0, get: 0, set: 0 } satisfies Record<Method, number>,
  reads: [],
  calls: noCalls(),
  launch(disk: Iterable<readonly [string, string | null]> = device.disk) {
    device.disk = new Map(disk);
    device.names.clear();
    device.failing = { open: 0, keys: 0, get: 0, set: 0 };
    device.reads = [];
    device.calls = noCalls();
    return device;
  },
  fail(method: Method, times: number) {
    device.failing[method] = times;
    return device;
  },
  script(reads: ReadonlyArray<AttemptFault>) {
    device.reads = reads;
    return device;
  },
};

/** The read script's fault for the attempt under way: the one after the failed opens and listings so far, or, for a record read, the one its listing began. */
const scripted = (method: Method): boolean => {
  const { failedOpens, keys, getsSinceListing } = device.calls;
  if (method === 'open') return device.reads[failedOpens + keys]?.at === 'open';
  if (method === 'keys') return device.reads[failedOpens + keys - 1]?.at === 'keys';
  if (method !== 'get' || keys === 0) return false;
  const fault = device.reads[failedOpens + keys - 1];
  return fault?.at === 'get' && fault.nth === getsSinceListing;
};

/** Counts a call of `method`, and throws when it is one of the failing ones or the read script fails it. */
const take = (method: Method) => {
  device.calls[method] += 1;
  if (method === 'keys') device.calls.getsSinceListing = 0;
  if (method === 'get') device.calls.getsSinceListing += 1;
  if (method === 'open' && scripted('open')) {
    device.calls.failedOpens += 1;
    throw new Error('test device: open failed');
  }
  if (method !== 'open' && scripted(method)) throw new Error(`test device: ${method} failed`);
  if (device.failing[method] === 0) return;
  device.failing[method] -= 1;
  if (method === 'open') device.calls.failedOpens += 1;
  throw new Error(`test device: ${method} failed`);
};

const handle = {
  getItem: (key: string) => {
    take('get');
    return device.disk.get(key) ?? null;
  },
  setItem: (key: string, value: string) => {
    take('set');
    device.disk.set(key, value);
  },
  removeItem: (key: string) => {
    device.calls.remove += 1;
    device.disk.delete(key);
  },
  clear: () => {
    device.calls.clear += 1;
    device.disk.clear();
  },
  getAllKeys: () => {
    take('keys');
    return [...device.disk.keys()];
  },
  close: () => {
    device.calls.close += 1;
  },
};

export const One = {
  Haptics: { impact: () => {}, selection: () => {}, notification: () => {} },
  // oxlint-disable-next-line effect/noNewPromise -- One's `Device.getInfo` answers a promise, and the stand-in answers as it does.
  Device: { getInfo: () => Promise.resolve({ isSimulator: false }) },
  Database: {
    openKeyValue: (options: { readonly name: string }) => {
      device.names.add(options.name);
      take('open');
      return handle;
    },
  },
};
