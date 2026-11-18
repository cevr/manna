/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noThrowStatement, effect/noNewError, effect/noAsyncFunction, effect/noNullish, effect/noTernary, no-await-in-loop -- a host tool over `xcrun simctl`, Bun's spawn and SQLite: plain TypeScript as the exact-kit's drives are; a simulator call that fails is a broken capture, said by a throw. */

/**
 * The simulator calls a capture makes, each naming its udid (never
 * `booted` or `all`): the status bar, the scheme, the text size and Reduce
 * Motion, each read back; the app stopped; its store written while it is
 * stopped; and the screen taken twice until two takes are the same bytes.
 */

import { Database } from 'bun:sqlite';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type { Store } from './fixtures.ts';

/** Runs a command to its end; its stdout, or a throw with its stderr. */
export const run = (argv: ReadonlyArray<string>, cwd?: string) => {
  const done = Bun.spawnSync([...argv], { cwd, stdout: 'pipe', stderr: 'pipe' });
  if (done.exitCode !== 0)
    throw new Error(
      `${argv.join(' ')} exited ${done.exitCode}: ${done.stderr.toString().slice(-800)}`,
    );
  return done.stdout.toString();
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
 * file that is no database, so the app's open fails.
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
