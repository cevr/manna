/* oxlint-disable effect/noNullish, effect/noTernary, effect/noAsyncFunction, effect/noRuntimeTypeof, effect/noUnsafeDictionaryType, effect/noUnknownParameters -- Exact's data module imports no effect (docs/exact.md): no module is a plain `undefined` or null, a source answers a Promise the host awaits and is handed the store and storage it does not read, and the module answers untyped JSON read field by field, as the tuner's sources take it. */

/** The app's module as a source is handed it. */
interface Native {
  readonly available: boolean;
  later(request: Record<string, unknown>): Promise<Record<string, unknown>>;
  watch(topic: string): void;
}

/** The reports after a serial, and the serial so far. */
export interface PinchHeard {
  readonly serial: number;
  readonly run: string;
}

export const pinchSources = () => ({
  findPinchTake: async (
    [since]: readonly [number],
    _store: unknown,
    _storage: unknown,
    native?: Native | null,
  ): Promise<PinchHeard> => {
    if (native == null) return { serial: since, run: '' };
    native.watch('pinch');
    if (!native.available) return { serial: since, run: '' };
    const got = await native.later({ op: 'pinch.take', since });
    const serial = typeof got['serial'] === 'number' ? got['serial'] : since;
    const run = typeof got['run'] === 'string' ? got['run'] : '';
    return { serial, run };
  },
});
