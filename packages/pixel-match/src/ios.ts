/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noThrowStatement, effect/noNewError, effect/noAsyncFunction, effect/noNullish, effect/noTernary, effect/noTryCatch, no-await-in-loop -- a host tool (its text size put back in a finally, whether the drive returned or threw) over `xcrun simctl`, Bun's spawn and SQLite: plain TypeScript as the exact-kit's drives are; a simulator call that fails is a broken capture, said by a throw. */

/**
 * The simulator calls a capture makes, each naming its udid (never
 * `booted` or `all`): the status bar, the scheme, the text size and Reduce
 * Motion, each read back; the app stopped; its store written while it is
 * stopped; and the screen taken twice until two takes are the same bytes.
 */

import { Database } from 'bun:sqlite';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { Option, Predicate, Schema } from 'effect';

import type { Store } from './fixtures.ts';

/** Runs a command to its end, with `env` over the process's own; its stdout, or a throw with its stderr. */
export const run = (
  argv: ReadonlyArray<string>,
  cwd?: string,
  env?: Readonly<Record<string, string>>,
) => {
  const done = Bun.spawnSync([...argv], {
    cwd,
    env: env === undefined ? undefined : { ...Bun.env, ...env },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (done.exitCode !== 0)
    throw new Error(
      `${argv.join(' ')} exited ${done.exitCode}: ${done.stderr.toString().slice(-800)}`,
    );
  return done.stdout.toString();
};

/** The last `count` non-empty lines of `text`. */
const tailOf = (text: string, count: number) =>
  text
    .split('\n')
    .filter((line) => line.trim() !== '')
    .slice(-count)
    .join('\n');

/**
 * Runs a drive to its end and keeps its whole stdout and stderr in `log`;
 * its stdout, or a throw that names the log and carries the tail of both:
 * an agent run with `--json` says why it stopped in its last reply on
 * stdout, and may leave stderr empty.
 */
export const runLogged = (
  argv: ReadonlyArray<string>,
  log: string,
  cwd?: string,
  env?: Readonly<Record<string, string>>,
) => {
  const done = Bun.spawnSync([...argv], {
    cwd,
    env: env === undefined ? undefined : { ...Bun.env, ...env },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const stdout = done.stdout.toString();
  const stderr = done.stderr.toString();
  mkdirSync(dirname(log), { recursive: true });
  writeFileSync(
    log,
    `$ ${argv.join(' ')}\nexit ${done.exitCode}\n--- stdout\n${stdout}\n--- stderr\n${stderr}\n`,
  );
  if (done.exitCode !== 0)
    throw new Error(
      `the drive exited ${done.exitCode} (whole output: ${log})\n--- stdout, last lines\n${tailOf(stdout, 6)}\n--- stderr, last lines\n${tailOf(stderr, 20)}`,
    );
  return stdout;
};

const simctl = (...args: ReadonlyArray<string>) => run(['xcrun', 'simctl', ...args]);

export const sleep = (ms: number) => Bun.sleep(ms);

/** The status bar every capture is taken under, on every simulator: 9:41, full Wi-Fi, a charged battery. */
export const overrideStatusBar = (udid: string) =>
  simctl(
    'status_bar',
    udid,
    'override',
    ...['--time', '9:41', '--dataNetwork', 'wifi', '--wifiMode', 'active', '--wifiBars', '3'],
    ...[
      '--cellularMode',
      'active',
      '--cellularBars',
      '4',
      '--batteryState',
      'charged',
      '--batteryLevel',
      '100',
    ],
  );

/** Sets the scheme and the text size, and reads each back; a value that does not hold throws. */
export const setLook = (udid: string, scheme: string, size: string) => {
  simctl('ui', udid, 'appearance', scheme);
  simctl('ui', udid, 'content_size', size);
  const [shownScheme, shownSize] = [
    simctl('ui', udid, 'appearance').trim(),
    simctl('ui', udid, 'content_size').trim(),
  ];
  if (shownScheme !== scheme || shownSize.toLowerCase() !== size)
    throw new Error(`${udid}: asked ${scheme} ${size}, reads ${shownScheme} ${shownSize}`);
};

/** The simulator's text size now, as `simctl ui content_size` reads it. */
export const contentSizeOf = (udid: string) =>
  simctl('ui', udid, 'content_size').trim().toLowerCase();

/** Sets the text size and reads it back; a size that does not hold throws. */
export const setContentSize = (udid: string, size: string) => {
  simctl('ui', udid, 'content_size', size);
  const shown = contentSizeOf(udid);
  if (shown !== size) throw new Error(`${udid}: asked text size ${size}, reads ${shown}`);
  return shown;
};

/**
 * Runs `body` at text size `size` and puts the simulator back to `rest`
 * after it, whether it returned or threw, so no later cell, test or drive on
 * the shared simulator inherits the size. `body` gets the size read back
 * after it ran, to record and check.
 */
export const atContentSize = <A>(
  sim: { readonly read: () => string; readonly set: (size: string) => void },
  size: string,
  rest: string,
  body: (readBack: () => string) => A,
) => {
  try {
    sim.set(size);
    return body(sim.read);
  } finally {
    if (sim.read() !== rest) sim.set(rest);
  }
};

/** Turns Reduce Motion on or off in the simulator's accessibility settings, read back; the app reads it at launch. */
export const setReduceMotion = (udid: string, on: boolean) => {
  simctl(
    'spawn',
    udid,
    'defaults',
    'write',
    'com.apple.Accessibility',
    'ReduceMotionEnabled',
    '-bool',
    on ? 'true' : 'false',
  );
  const shown = simctl(
    'spawn',
    udid,
    'defaults',
    'read',
    'com.apple.Accessibility',
    'ReduceMotionEnabled',
  ).trim();
  if (shown !== (on ? '1' : '0')) throw new Error(`${udid}: Reduce Motion reads ${shown}`);
};

/**
 * Turns on Accessibility's Prefer Non-Blinking Cursor, read back: a text
 * field's caret then holds steady, drawn, so a capture with a field
 * focused holds still and draws the caret the same in both apps. The app
 * reads it at launch.
 */
export const setSteadyCaret = (udid: string) => {
  const key = ['com.apple.Accessibility', 'PrefersNonBlinkingCursorIndicator'];
  simctl('spawn', udid, 'defaults', 'write', ...key, '-bool', 'true');
  const shown = simctl('spawn', udid, 'defaults', 'read', ...key).trim();
  if (shown !== '1') throw new Error(`${udid}: Prefer Non-Blinking Cursor reads ${shown}`);
};

/** Stops the app; an app not running is already stopped. */
export const terminate = (udid: string, bundle: string) => {
  Bun.spawnSync(['xcrun', 'simctl', 'terminate', udid, bundle], {
    stdout: 'ignore',
    stderr: 'ignore',
  });
};

/** The app's data container on the simulator. */
const containerOf = (udid: string, bundle: string) =>
  simctl('get_app_container', udid, bundle, 'data').trim();

/**
 * Writes `store` as the app's whole store while it is stopped: One's
 * `one_kv` table emptied and filled with the pairs, or for a broken store a
 * file that is no database, so every read of it fails.
 */
export const writeStore = (udid: string, bundle: string, file: string, store: Store) => {
  const path = join(containerOf(udid, bundle), file);
  mkdirSync(dirname(path), { recursive: true });
  for (const side of ['-wal', '-shm']) if (existsSync(path + side)) writeFileSync(path + side, '');
  if (store._tag === 'Broken') {
    writeFileSync(path, 'not a database');
    return;
  }
  if (existsSync(path) && readFileSync(path).subarray(0, 6).toString() !== 'SQLite')
    writeFileSync(path, '');
  const db = new Database(path, { create: true });
  db.run('CREATE TABLE IF NOT EXISTS one_kv (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)');
  db.run('DELETE FROM one_kv');
  const insert = db.prepare('INSERT INTO one_kv (key, value) VALUES (?, ?)');
  for (const [key, value] of store.pairs) insert.run(key, value);
  db.close();
};

/** One screenshot of the simulator's screen, as PNG bytes. */
const screenshot = (udid: string, file: string) => {
  simctl('io', udid, 'screenshot', file);
  return readFileSync(file);
};

/** Whether two byte arrays are the same bytes. */
const same = (a: Uint8Array, b: Uint8Array) =>
  a.length === b.length && a.every((byte, i) => byte === b[i]);

/**
 * The screen once it is still: two takes 500 ms apart that are the same
 * bytes, three tries; none when it never held still.
 */
export const stillShot = async (udid: string, file: string) => {
  for (let attempt = 0; attempt < 3; attempt++) {
    const first = screenshot(udid, file);
    await sleep(500);
    const second = screenshot(udid, file);
    if (same(first, second)) return second;
    await sleep(700);
  }
  return undefined;
};

/** A rect's top and height in points: the first object with a numeric `x`, `y`, `width` and `height` in a driver's JSON answer, depth first; none when the text is no JSON or holds none. */
export const rectIn = (text: string) =>
  Option.getOrUndefined(Option.flatMap(decodeJson(text), firstRect));

const Rect = Schema.Struct({
  x: Schema.Finite,
  y: Schema.Finite,
  width: Schema.Finite,
  height: Schema.Finite,
});
const isRect = Schema.is(Rect);
const decodeJson = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Json));

const isJson = Schema.is(Schema.Json);

/** The first rect in a JSON value, depth first. */
const firstRect = (value: Schema.Json): Option.Option<typeof Rect.Type> => {
  if (isRect(value)) return Option.some(value);
  if (!Predicate.isObject(value)) return Option.none();
  for (const inner of Object.values(value).filter(isJson)) {
    const found = firstRect(inner);
    if (Option.isSome(found)) return found;
  }
  return Option.none();
};
