/* oxlint-disable effect/noNullish, effect/noThrowStatement, effect/noNewError -- the stand-in answers as One's synchronous store does: a listed key with no value is null, and a call that fails throws. */

/**
 * `one` as the app's tests see it: a phone's safe area with no insets, its
 * haptics (felt by nothing), its device info (a phone, not the simulator),
 * and its key-value database (`device`, below). `setup.ts` stands this
 * module in for `one`, the router's boundary, with the parts the screens use.
 */
export const useSafeAreaInsets = () => ({ top: 0, right: 0, bottom: 0, left: 0 });

type Method = 'open' | 'keys' | 'get' | 'set';

interface Device {
  disk: Map<string, string | null>;
  readonly names: Set<string>;
  failing: Record<Method, number>;
  calls: Record<Method | 'remove' | 'clear', number>;
  readonly launch: (disk?: Iterable<readonly [string, string | null]>) => Device;
  readonly fail: (method: Method, times: number) => Device;
}

/**
 * The reader's device as `One.Database` shows it to the app: a disk that
 * outlives every launch (a key listed with no value is `null`), the calls
 * each method has taken, and how many of its next calls fail. `launch`
 * starts a test over a disk; a failing call throws as One's store throws.
 */
export const device: Device = {
  disk: new Map<string, string | null>(),
  names: new Set<string>(),
  failing: { open: 0, keys: 0, get: 0, set: 0 } satisfies Record<Method, number>,
  calls: { open: 0, keys: 0, get: 0, set: 0, remove: 0, clear: 0 },
  launch(disk: Iterable<readonly [string, string | null]> = device.disk) {
    device.disk = new Map(disk);
    device.names.clear();
    device.failing = { open: 0, keys: 0, get: 0, set: 0 };
    device.calls = { open: 0, keys: 0, get: 0, set: 0, remove: 0, clear: 0 };
    return device;
  },
  fail(method: Method, times: number) {
    device.failing[method] = times;
    return device;
  },
};

/** Counts a call of `method`, and throws when it is one of the failing ones. */
const take = (method: Method) => {
  device.calls[method] += 1;
  if (device.failing[method] === 0) return;
  device.failing[method] -= 1;
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
  close: () => {},
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
