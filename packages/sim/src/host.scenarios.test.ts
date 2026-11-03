/* oxlint-disable effect/noNodeBuiltinImport, no-restricted-imports, effect/noGlobals -- each scenario builds its link layout on a real scratch tree with node:fs, as a tool or a person would, and reads the CLI's printed lines as JSON. */
/**
 * The contained host on the layouts the round-1 review built by hand, each
 * through `runSim` on a real scratch tree (`fixtures/contain.ts`): an
 * internal alias whose descendants lead out (under derived data, and as the
 * workspace the prebuild writes), a link target whose `..` follows a link,
 * a results file and a server output folder that lead out, and the cases
 * the layer must keep working (clean refuses linked Pods before it deletes,
 * down replaces a destination link, a session read refuses an outside
 * source, the dev server runs in the app). The resolver and the tree walk
 * are held against the OS on the same receipts in `host.test.ts`.
 */
import * as nfs from 'node:fs';

import { describe, expect, it } from 'effect-bun-test';
import { Effect } from 'effect';

import { runScenario } from './fixtures/contain.ts';

const scenario = (name: string, setup: Parameters<typeof runScenario>[1]) =>
  Effect.promise(() => runScenario(name, setup));

const read = (line: string): { ok?: unknown; error?: { _tag?: unknown } } => JSON.parse(line);

/** The run failed typed, changed nothing outside, and printed its refusal once. */
const refusedOnce = (ran: Awaited<ReturnType<typeof runScenario>>) => {
  expect(ran.violations).toEqual([]);
  expect({ ok: ran.ok, typed: ran.typed }).toEqual({ ok: false, typed: true });
  const failures = ran.lines.map(read).filter((line) => line.ok === false);
  expect(failures.map((line) => line.error?._tag)).toEqual(['Escaped']);
};

describe('the contained host on the review receipts', () => {
  it.live('refuses a build into derived data whose Build alias holds a link out', () =>
    Effect.gen(function* () {
      const ran = yield* scenario('ios:install', (l) => {
        const app = l.place.app;
        nfs.mkdirSync(`${l.base}/outside/object`, { recursive: true });
        nfs.mkdirSync(`${app}/SharedBuild/Intermediates.noindex`, { recursive: true });
        nfs.symlinkSync(
          `${l.base}/outside/object`,
          `${app}/SharedBuild/Intermediates.noindex/Hymnal.build`,
        );
        nfs.mkdirSync(`${app}/ios/build/dd`, { recursive: true });
        nfs.symlinkSync(`${app}/SharedBuild`, `${app}/ios/build/dd/Build`);
      });
      refusedOnce(ran);
    }),
  );

  it.live('refuses the prebuild when the workspace is an alias whose contents lead out', () =>
    Effect.gen(function* () {
      const ran = yield* scenario('ios:install --prebuild', (l) => {
        const app = l.place.app;
        nfs.renameSync(`${app}/ios/Hymnal.xcworkspace`, `${app}/SharedWorkspace`);
        nfs.renameSync(
          `${app}/SharedWorkspace/contents.xcworkspacedata`,
          `${l.base}/outside/workspace.txt`,
        );
        nfs.symlinkSync(
          `${l.base}/outside/workspace.txt`,
          `${app}/SharedWorkspace/contents.xcworkspacedata`,
        );
        nfs.symlinkSync(`${app}/SharedWorkspace`, `${app}/ios/Hymnal.xcworkspace`);
      });
      refusedOnce(ran);
    }),
  );

  it.live("refuses an Info.plist whose link target's `..` follows a link out", () =>
    Effect.gen(function* () {
      const ran = yield* scenario('ios:install', (l) => {
        const app = l.place.app;
        nfs.mkdirSync(`${l.base}/outside/deep`, { recursive: true });
        nfs.renameSync(`${app}/ios/Hymnal/Info.plist`, `${l.base}/outside/Trap.plist`);
        nfs.writeFileSync(`${app}/ios/Trap.plist`, '<plist/>');
        nfs.symlinkSync(`${l.base}/outside/deep`, `${app}/ios/Hop`);
        nfs.symlinkSync('../Hop/../Trap.plist', `${app}/ios/Hymnal/Info.plist`);
      });
      refusedOnce(ran);
    }),
  );

  it.live('prints the refusal when the journey results file leads out', () =>
    Effect.gen(function* () {
      const ran = yield* scenario('ios:journey probe --skip-video', (l) => {
        nfs.writeFileSync(`${l.base}/outside/results.txt`, 'sentinel');
        nfs.mkdirSync(`${l.base}/out`, { recursive: true });
        nfs.symlinkSync(`${l.base}/outside/results.txt`, `${l.base}/out/results.jsonl`);
      });
      refusedOnce(ran);
    }),
  );

  it.live('prints the refusal when the server output folder leads out', () =>
    Effect.gen(function* () {
      const ran = yield* scenario('none:serve --port 8270 --out <state>/run', (l) => {
        nfs.mkdirSync(`${l.base}/outside/run`, { recursive: true });
        nfs.symlinkSync(`${l.base}/outside/run`, `${l.base}/state/run`);
      });
      refusedOnce(ran);
    }),
  );
});

describe('the contained host keeps the layouts it must', () => {
  it.live('clean refuses linked Pods before it removes anything', () =>
    Effect.gen(function* () {
      const ran = yield* scenario('ios:down --clean', (l) => {
        const app = l.place.app;
        nfs.renameSync(`${app}/ios/Pods`, `${l.base}/outside/pods`);
        nfs.symlinkSync(`${l.base}/outside/pods`, `${app}/ios/Pods`);
      });
      expect(ran.violations).toEqual([]);
      expect(ran.ok).toBe(false);
      expect(ran.ops.filter((op) => op.startsWith('remove '))).toEqual([]);
      expect(ran.lines.map(read).map((line) => line.error?._tag)).toEqual(['Unhealthy']);
    }),
  );

  it.live("down replaces a destination link, not the link's target", () =>
    Effect.gen(function* () {
      const ran = yield* scenario('ios:down', (l) => {
        nfs.writeFileSync(`${l.base}/outside/archive.json`, 'outside sentinel');
        nfs.symlinkSync(`${l.base}/outside/archive.json`, `${l.base}/out/session.json`);
      });
      expect(ran.violations).toEqual([]);
      expect(ran.ok).toBe(true);
      expect(ran.ops.some((op) => op.startsWith('rename '))).toBe(true);
    }),
  );

  it.live('a session read refuses an outside source before it renames', () =>
    Effect.gen(function* () {
      const ran = yield* scenario('ios:down', (l) => {
        nfs.renameSync(`${l.base}/state/session.json`, `${l.base}/outside/session.json`);
        nfs.symlinkSync(`${l.base}/outside/session.json`, `${l.base}/state/session.json`);
      });
      expect(ran.violations).toEqual([]);
      expect(ran.ok).toBe(false);
      expect(ran.ops.filter((op) => op.startsWith('rename '))).toEqual([]);
    }),
  );

  it.live('the dev server runs in the app root', () =>
    Effect.gen(function* () {
      let app = '';
      const ran = yield* scenario('none:serve --port 8270 --out <out>', (l) => {
        app = l.place.app;
      });
      const cwds = ran.ops.filter((op) => op.startsWith('spawn '));
      expect(cwds.length).toBeGreaterThan(0);
      for (const op of cwds) expect(op.endsWith(` cwd=${app}`)).toBe(true);
    }),
  );
});
