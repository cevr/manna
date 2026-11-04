/**
 * The README's residual race (`README.md`, "The residual race") rests on
 * how macOS hands out pids. This is a model of XNU's allocator
 * (`bsd/kern/kern_fork.c`, `forkproc`'s search from the last pid): a
 * cursor that moves up from the last pid given, wraps from `PID_MAX` to the
 * first pid past the reserved ones, and skips a pid a live process holds.
 * It pins the README's claim: once the drive's server exits, nothing bounds
 * how many process creations come before its pid is given again. The
 * cursor moves for every creation while the server lives, so after a wrap
 * it can sit just below the server's pid, and the first creation after the
 * exit takes it.
 */
import { describe, expect, it } from 'effect-bun-test';
import { Effect } from 'effect';

/** XNU's `PID_MAX`: the cursor wraps when it reaches it. */
const PID_MAX = 99_999;
/** The first pid the cursor takes after a wrap. */
const FIRST = 100;

/** A pid space: pids from `first` to `max - 1`, and the live ones. */
interface Space {
  readonly max: number;
  readonly first: number;
  readonly live: Set<number>;
}

/**
 * The next pid after `last`: up by one, wrapping at `max` to `first`, past
 * every live pid (a search that comes round to `last` stops there; every
 * space here keeps a pid free).
 */
const allocate = (space: Space, last: number) => {
  let pid = last;
  do {
    pid += 1;
    if (pid >= space.max) pid = space.first;
  } while (space.live.has(pid) && pid !== last);
  space.live.add(pid);
  return pid;
};

/**
 * The drive's server is given `owned`; `lifetime` short-lived processes
 * are created (and end) while it lives; then it exits. How many creations
 * after the exit until one is given `owned` again.
 */
const reuseAfterExit = (space: Space, owned: number, lifetime: number) => {
  space.live.add(owned);
  let cursor = owned;
  for (let n = 0; n < lifetime; n += 1) {
    cursor = allocate(space, cursor);
    space.live.delete(cursor);
  }
  space.live.delete(owned);
  for (let creations = 1; ; creations += 1) {
    cursor = allocate(space, cursor);
    space.live.delete(cursor);
    if (cursor === owned) return creations;
  }
};

/** The pids a creation can be given: every pid from `first` up to `max`, but the live ones. */
const free = (space: Space) => space.max - space.first - space.live.size;

describe('the pid allocator model behind the residual race', () => {
  it.effect(
    'a server at 5000 outlives a wrap, and the first creation after its exit takes 5000',
    () =>
      Effect.sync(() => {
        const space: Space = { max: PID_MAX, first: FIRST, live: new Set() };
        const lifetime = PID_MAX - FIRST - 1;
        expect(lifetime).toBe(99_898);
        expect(reuseAfterExit(space, 5000, lifetime)).toBe(1);
      }),
  );

  it.effect(
    'over small pid spaces, every server pid, lifetime and pattern of other live pids: the creations after the exit take every value from 1 to the free pids, and no bound above 1 holds',
    () =>
      Effect.sync(() => {
        const patterns: ReadonlyArray<(pid: number) => boolean> = [
          () => false,
          (pid) => pid % 3 === 0,
        ];
        let states = 0;
        const wrong: Array<{ max: number; owned: number; got: ReadonlyArray<number> }> = [];
        for (let max = 6; max <= 32; max += 1)
          for (const busy of patterns)
            for (let owned = 2; owned < max; owned += 1) {
              if (busy(owned)) continue;
              const others = Array.from({ length: max - 2 }, (_, i) => i + 2).filter(
                (pid) => pid !== owned && busy(pid),
              );
              const base: Space = { max, first: 2, live: new Set(others) };
              const room = free(base);
              const seen = new Set<number>();
              for (let lifetime = 0; lifetime <= 2 * room; lifetime += 1) {
                seen.add(reuseAfterExit({ ...base, live: new Set(others) }, owned, lifetime));
                states += 1;
              }
              const want = Array.from({ length: room }, (_, i) => i + 1);
              const got = [...seen].toSorted((a, b) => a - b);
              if (got.join() !== want.join()) wrong.push({ max, owned, got });
            }
        expect(wrong).toEqual([]);
        expect(states).toBeGreaterThan(10_000);
      }),
  );

  it.effect(
    'the creations after the exit are what the cursor has left to come round: the whole space for a server no creation outlived, one for a server whose lifetime brought the cursor just below its pid',
    () =>
      Effect.sync(() => {
        const space: Space = { max: 40, first: 2, live: new Set() };
        const room = free(space) - 1;
        const owned = 20;
        expect(reuseAfterExit({ ...space, live: new Set() }, owned, 0)).toBe(room + 1);
        expect(reuseAfterExit({ ...space, live: new Set() }, owned, room - 1)).toBe(2);
        expect(reuseAfterExit({ ...space, live: new Set() }, owned, room)).toBe(1);
      }),
  );
});
