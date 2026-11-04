/**
 * Who may signal for a state folder: the state's holder, one command at a
 * time. A command holds the state by creating the next generation of
 * `<state>/holders/`, a symbolic link named for its number whose target is
 * the text of the holding command's identity (`Os.self`); it lets go by
 * creating `<generation>.done` beside it. No generation and no release is
 * ever removed or renamed, so each name is created at most once, ever: of
 * any number of commands that judged one top generation free, exactly one
 * creates the next name and the others meet `AlreadyExists`. A holder whose
 * command ended without letting go (killed, or a failed release) is known by
 * identity: the start time read at its pid is no longer the one it recorded.
 * The holder never signals and never starts a process.
 */
import { Effect, FileSystem, Option, Random } from 'effect';
import type { PlatformError } from 'effect/PlatformError';

import { StateBusy } from './errors.ts';
import { type Identity, Os, signalable } from './os.ts';

/** A hold on a state: the holders folder and the generation this command created. */
export interface Held {
  readonly folder: string;
  readonly generation: number;
}

/** A generation's name: its number, zero-padded, so a listing names each one the same way. */
const generationName = (generation: number) => String(generation).padStart(12, '0');
const GENERATION = /^\d{12}$/;
const RELEASED = '.done';

/** How many times `acquire` lists again after another command created the name it tried. */
const TRIES = 8;

/** A start time as a generation link holds it: one path name, with no `/` and no `:`. */
const encodeStarted = (started: string) => encodeURIComponent(started);

/** The text a generation link holds: the holding command's pid and start time, and this hold's nonce. */
const holderText = (self: Identity, nonce: string) =>
  `h1:${self.pid}:${encodeStarted(self.started)}:${nonce}`;

const HOLDER = /^h1:(-?\d+):([^:]*):[^:]+$/;

/** The holder a generation link names, its start time still encoded; none when its text is not a holder's. */
const holderOf = (text: string): Option.Option<Identity> =>
  Option.map(Option.fromNullishOr(HOLDER.exec(text)), (match) => ({
    pid: Number(match[1]),
    started: match[2] ?? '',
  }));

/** The holder still runs: the start time read at its pid now, encoded, is the one it recorded. */
const alive = Effect.fnUntraced(function* (holder: Identity) {
  const os = yield* Os;
  if (!signalable(holder.pid)) return false;
  const now = yield* os.started(holder.pid);
  return Option.contains(Option.map(now, encodeStarted), holder.started);
});

const isAlreadyExists = (error: PlatformError) => error.reason._tag === 'AlreadyExists';

/** The top generation in a listing of the holders folder: its number, 0 when there is none. */
const topOf = (names: ReadonlyArray<string>) =>
  Math.max(0, ...names.filter((name) => GENERATION.test(name)).map(Number));

/**
 * Hold `state` for this command. The top generation must be free: released,
 * or its holder gone (its pid holds no process, or one with another start
 * time); then this command creates the next one. A live holder fails
 * `StateBusy` naming its pid; so does a state whose next name another
 * command took first `TRIES` times in a row.
 */
export const acquire = Effect.fn('Sim.acquire')(function* (state: string) {
  const fs = yield* FileSystem.FileSystem;
  const os = yield* Os;
  const self = yield* os.self;
  const nonce = (yield* Random.nextIntBetween(0, 2 ** 31)).toString(36);
  const folder = `${state}/holders`;
  yield* fs.makeDirectory(folder, { recursive: true });
  for (let tries = 0; tries < TRIES; tries += 1) {
    const names = yield* fs.readDirectory(folder);
    const top = topOf(names);
    if (top > 0 && !names.includes(`${generationName(top)}${RELEASED}`)) {
      const holder = holderOf(yield* fs.readLink(`${folder}/${generationName(top)}`));
      if (Option.isSome(holder) && (yield* alive(holder.value)))
        return yield* StateBusy.make({ state, pid: holder.value.pid });
    }
    const next = top + 1;
    const made = yield* fs
      .symlink(holderText(self, nonce), `${folder}/${generationName(next)}`)
      .pipe(
        Effect.as(true),
        Effect.catchIf(isAlreadyExists, () => Effect.succeed(false)),
      );
    if (made) return { folder, generation: next } satisfies Held;
  }
  return yield* StateBusy.make({ state, pid: 0 });
});

/** Let go of a hold: its generation's release link. A failed release leaves a hold that ends with this command's process. */
export const release = (held: Held) =>
  Effect.flatMap(FileSystem.FileSystem, (fs) =>
    Effect.ignore(
      fs.symlink('released', `${held.folder}/${generationName(held.generation)}${RELEASED}`),
    ),
  );
