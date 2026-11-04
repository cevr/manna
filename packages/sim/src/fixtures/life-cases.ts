/* oxlint-disable effect/noNodeBuiltinImport, no-restricted-imports, effect/noAsyncFunction, effect/noNewPromise, effect/noTryCatch, effect/noTernary, no-await-in-loop -- each case runs its commands as promises one after another, as separate processes would, removes its scratch folder however it ends, and reads the output folder it judges with node:fs. */
/**
 * The cases the lifecycle tests run over the model (`life.ts`), each a
 * world of its own in a scratch folder removed after: what it observed, to
 * compare with what it expects, and every violation the model found.
 */
import * as nfs from 'node:fs';

import {
  boot,
  type Cmd,
  converge,
  down,
  dispose,
  generated,
  type How,
  isFileMutation,
  isSessionRead,
  isTool,
  live,
  nth,
  pair,
  pauseWorld,
  phase,
  recoverySweep,
  run,
  scratch,
  step,
  type Subject,
  sweep,
  tap,
  world,
  type World,
} from './life.ts';

/** What a case saw, and every violation the model found in its world. */
export interface Seen {
  readonly observed: unknown;
  readonly violations: ReadonlyArray<string>;
}

export interface Case {
  readonly name: string;
  readonly expected: unknown;
  readonly run: () => Promise<Seen>;
}

/** Run `use` in a scratch folder of its own, removed after. */
const inScratch = async <A>(use: (parent: string) => Promise<A>) => {
  const parent = scratch();
  try {
    return await use(parent);
  } finally {
    dispose(parent);
  }
};

/** A case over one world: `body` returns what it observed. */
const oneWorld = (seed: number, body: (w: World) => Promise<unknown>) => (): Promise<Seen> =>
  inScratch(async (parent) => {
    const w = world(parent, seed);
    const observed = await body(w);
    return { observed, violations: w.violations };
  });

const PLATFORMS = ['ios', 'web'] as const;

const filed = (out: string) =>
  nfs
    .readdirSync(out)
    .filter((name) => name.endsWith('.json'))
    .toSorted();

/** The unit test's three: a census trigger, a dead holder reclaimed, and two reclaimers of one. */
export const UNIT: ReadonlyArray<Case> = [
  {
    name: 'a down that exits abruptly after its first file mutation leaves the record where the next down finds it',
    expected: { killed: 'exited', after: 'live', next: 'ok', again: 'ok', left: 0 },
    run: oneWorld(1, async (w) => {
      await step(w, boot('a', 'web'));
      const killed = await step(w, down('a'), {
        fault: { at: nth(isFileMutation, 1), how: 'exit' },
      });
      const after = phase(w, 'a');
      const next = await step(w, down('a'));
      const again = await step(w, boot('a', 'ios'));
      await step(w, down('a'));
      return {
        killed: killed.outcome,
        after,
        next: next.outcome,
        again: again.outcome,
        left: live(w).length,
      };
    }),
  },
  {
    name: 'a holder whose command exited abruptly is reclaimed by the next down, which stops the server',
    expected: { killed: 'exited', next: 'ok', left: 0 },
    run: oneWorld(2, async (w) => {
      await step(w, boot('a', 'ios'));
      const killed = await step(w, down('a'), {
        fault: { at: nth(isFileMutation, 2), how: 'exit' },
      });
      const next = await step(w, down('a'));
      return { killed: killed.outcome, next: next.outcome, left: live(w).length };
    }),
  },
  {
    name: 'two downs that reclaim one dead holder at once: exactly one stops the server',
    expected: { outcomes: ['fail', 'ok'], left: 0 },
    run: oneWorld(3, async (w) => {
      await step(w, boot('a', 'web'));
      await step(w, down('a'), { fault: { at: nth(isFileMutation, 1), how: 'exit' } });
      const both = await pair(w, down('a'), down('a'));
      return { outcomes: both.map((one) => one.outcome).toSorted(), left: live(w).length };
    }),
  },
];

/** The tool call that closes each platform's driver in a `down`. */
const CLOSE = {
  ios: isTool('agent-device', 'close'),
  web: isTool('agent-browser', 'close'),
} as const;

const interruptedClose = (platform: 'ios' | 'web'): Case => ({
  name: `r1-M1 ${platform}: a down interrupted while it closes the driver leaves the record for the next down`,
  expected: { cut: 'interrupted', left: 'live', next: 'ok' },
  run: oneWorld(11, async (w) => {
    await step(w, boot('a', platform));
    const cut = await step(w, down('a'), {
      fault: { at: nth(CLOSE[platform], 1), how: 'interrupt' },
    });
    const left = phase(w, 'a');
    const next = await step(w, down('a'));
    await converge(w);
    return { cut: cut.outcome, left, next: next.outcome };
  }),
});

const homeMadeAFile: Case = {
  name: 'r1-M1: with its scratch HOME made a file, down still stops the server and files it, then fails typed',
  expected: { down: 'fail', tag: 'HostFailed', after: { phase: 'none', live: 0 }, boot: 'fail' },
  run: oneWorld(12, async (w) => {
    await step(w, boot('a', 'ios'));
    const home = `${w.states.a}/home`;
    nfs.rmSync(home, { recursive: true, force: true });
    nfs.writeFileSync(home, 'not a folder');
    const broken = await step(w, down('a'));
    const after = { phase: phase(w, 'a'), live: live(w).length };
    const refused = await step(w, boot('a', 'ios'));
    nfs.rmSync(home, { force: true });
    await converge(w);
    return { down: broken.outcome, tag: broken.tag, after, boot: refused.outcome };
  }),
};

const readFailsBesideNewer = (platform: 'ios' | 'web'): Case => ({
  name: `r2-M1 ${platform}: the down's session read fails while a newer boot tries the state`,
  expected: { failed: 'fail', newer: 'StateBusy', left: 'live' },
  run: oneWorld(21, async (w) => {
    await step(w, boot('a', platform));
    let newer = '';
    const failed = await step(w, down('a'), {
      fault: { at: nth(isSessionRead, 1), how: 'fail' },
      pause: {
        at: nth(isSessionRead, 1),
        run: async () => {
          newer = (await run(w, boot('a', platform, 8271))).tag;
        },
      },
    });
    const left = phase(w, 'a');
    await converge(w);
    return { failed: failed.outcome, newer, left };
  }),
});

const sharedOutTwoStates: Case = {
  name: 'r3-M1: two downs filing two states into one --out at once keep both files',
  expected: { outcomes: ['ok', 'ok'], filed: ['session-2.json', 'session.json'] },
  run: oneWorld(31, async (w) => {
    const out = `${w.base}/shared-out`;
    await step(w, boot('a', 'web', 8270, out));
    await step(w, boot('b', 'ios', 8271, out));
    const both = await Promise.all([run(w, down('a')), run(w, down('b'))]);
    const seen = { outcomes: both.map((one) => one.outcome), filed: filed(out) };
    await converge(w);
    return seen;
  }),
};

const sharedOutOneState: Case = {
  name: 'r3-M1: two sessions of one state filed into one --out keep both files',
  expected: ['session-2.json', 'session.json'],
  run: oneWorld(32, async (w) => {
    const out = `${w.base}/shared-out`;
    for (const platform of PLATFORMS) {
      await step(w, boot('a', platform, 8270, out));
      await step(w, down('a'));
    }
    return filed(out);
  }),
};

const failedRecovery = (platform: 'ios' | 'web', first: 'fail' | 'interrupt'): Case => ({
  name: `r3-M2 ${platform}: the read ${first === 'fail' ? 'fails' : 'is interrupted'} beside a newer boot, then each of the recovery's first four calls fails`,
  expected: [1, 2, 3, 4].map(() => `${first === 'fail' ? 'fail' : 'interrupted'} live`),
  run: () =>
    inScratch(async (parent) => {
      const observed: Array<string> = [];
      const violations: Array<string> = [];
      for (let j = 1; j <= 4; j += 1) {
        const w = world(parent, 40 + j);
        await step(w, boot('a', platform));
        const ended = await step(w, down('a'), {
          fault: { at: nth(isSessionRead, 1), how: first },
          second: { at: j, how: 'fail' },
          pause: { at: nth(isSessionRead, 1), run: () => run(w, boot('a', platform, 8271)) },
        });
        observed.push(`${ended.outcome} ${phase(w, 'a')}`);
        await converge(w);
        violations.push(...w.violations.map((line) => `[recovery call ${j}] ${line}`));
      }
      return { observed, violations };
    }),
});

const exitAfterMutation = (platform: 'ios' | 'web', n: number): Case => ({
  name: `r3-M2 ${platform}: a down that exits abruptly after file mutation #${n} is followed by a down and a boot that converge`,
  expected: { killed: 'exited', again: 'ok' },
  run: oneWorld(50 + n, async (w) => {
    await step(w, boot('a', platform));
    const killed = await step(w, down('a'), { fault: { at: nth(isFileMutation, n), how: 'exit' } });
    await step(w, down('a'));
    const again = await step(w, boot('a', platform));
    await converge(w);
    return { killed: killed.outcome, again: again.outcome };
  }),
});

/** One case per trigger of the rewrite's census, each the counterexample a failed round met. */
export const CENSUS: ReadonlyArray<Case> = [
  ...PLATFORMS.map(interruptedClose),
  homeMadeAFile,
  ...PLATFORMS.map(readFailsBesideNewer),
  sharedOutTwoStates,
  sharedOutOneState,
  ...PLATFORMS.flatMap((platform) =>
    (['fail', 'interrupt'] as const).map((first) => failedRecovery(platform, first)),
  ),
  ...PLATFORMS.flatMap((platform) => [1, 2, 3].map((n) => exitAfterMutation(platform, n))),
];

const none = async () => {};
const booted = (w: World) => step(w, boot('a', 'web'));
const deadHolder = async (w: World) => {
  await step(w, boot('a', 'ios'));
  await step(w, down('a'), { fault: { at: nth(isFileMutation, 1), how: 'exit' } });
};

const pairCase = (name: string, setup: (w: World) => Promise<unknown>, x: Cmd, y: Cmd): Case => ({
  name: `${name}: at most one of two boots or downs is ok, and the next down finds every server`,
  expected: true,
  run: oneWorld(7, async (w) => {
    await setup(w);
    await pair(w, x, y);
    await converge(w);
    return true;
  }),
});

/** Two commands at once, each pair after its setup. */
export const PAIRS: ReadonlyArray<Case> = [
  pairCase('down‖down', booted, down('a'), down('a')),
  pairCase('boot‖boot from none', none, boot('a', 'ios'), boot('a', 'web', 8271)),
  pairCase('boot‖down from none', none, boot('a', 'web'), down('a')),
  pairCase('boot‖down from live', booted, boot('a', 'ios', 8271), down('a')),
  pairCase('down‖tap', booted, down('a'), tap('a')),
  pairCase('down‖down over a dead holder', deadHolder, down('a'), down('a')),
  pairCase(
    'boot‖boot over a dead holder',
    deadHolder,
    boot('a', 'web', 8271),
    boot('a', 'ios', 8272),
  ),
];

/** The newer commands a pause sweep runs at each host call of a subject in state `s`. */
export const newerOf = (s: 'a' | 'b'): ReadonlyArray<Cmd> => [
  boot(s, 'web', 8273),
  down(s),
  tap(s),
];

/** `newer` run to its end at each host call of `subject` in turn, until a pause lands past its last call. */
export const pauseSweep = (subject: Subject, newer: Cmd, limit = 80) =>
  inScratch(async (parent) => {
    const violations: Array<string> = [];
    let worlds = 0;
    for (let k = 1; k <= limit; k += 1) {
      const one = await pauseWorld(parent, subject, newer, k);
      violations.push(...one.violations.map((line) => `[pause at ${k}] ${line}`));
      if (!one.reached) return { violations, worlds, ended: true };
      worlds += 1;
    }
    return { violations, worlds, ended: false };
  });

/** The generated sequences `from` to `to` (exclusive): every violation. */
export const generatedSequences = (from: number, to: number) =>
  inScratch(async (parent) => {
    const violations: Array<string> = [];
    for (let seed = from; seed < to; seed += 1) violations.push(...(await generated(parent, seed)));
    return violations;
  });

/** A part of `subject`'s sweep with `how` at host calls `from` to `to`. */
export const sweepPart = (subject: Subject, how: How, from: number, to: number) =>
  inScratch((parent) => sweep(parent, subject, how, from, to));

/** `first` at each of `calls`, then `second` at each call of the recovery. */
export const recoveryPart = (
  subject: Subject,
  first: 'fail' | 'interrupt',
  second: 'fail' | 'exit',
  calls: ReadonlyArray<number>,
) =>
  inScratch(async (parent) => {
    const violations: Array<string> = [];
    for (const k of calls)
      violations.push(...(await recoverySweep(parent, subject, first, k, second)).violations);
    return violations;
  });
