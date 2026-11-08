/* oxlint-disable effect/noTernary, effect/noGlobals -- the generator and the cases write their choices as plain branches, and a failing case is named by its JSON. */

/**
 * The natural voice's reducer at its seam, `step`, and the line Today
 * shows, `lineOf`. The line is a property over every download state, the
 * fuse, the owed crash line and the choice, plus seeded byte counts,
 * against the words written out here and a percent found by integer
 * search. The reducer is held over every input from every machine to the
 * rules each input owns (the calls it may ask for, the states that ignore
 * it), then walked through the launches the owner named: the first time
 * Voice is on, the crash said once, a load's bad file fetched once again.
 */

import { describe, expect, it } from 'bun:test';
import { Match, Option } from 'effect';

import type { Choice } from '../voice';
import { TOTAL_BYTES } from './manifest';
import {
  closed,
  lineOf,
  reads,
  step,
  storedFuse,
  type Call,
  type Download,
  type Input,
  type Machine,
  type NaturalView,
} from './state';

const CHOICES: ReadonlyArray<Choice> = ['off', 'her', 'him'];

const FIXED: ReadonlyArray<Download> = [
  { _tag: 'Idle' },
  { _tag: 'Waiting' },
  { _tag: 'Loading' },
  { _tag: 'Ready' },
  { _tag: 'Unsupported' },
  { _tag: 'Failed', reason: 'network' },
  { _tag: 'Failed', reason: 'check' },
  { _tag: 'Failed', reason: 'space' },
  { _tag: 'Failed', reason: 'load' },
  { _tag: 'Downloading', bytes: 0, total: TOTAL_BYTES },
  { _tag: 'Downloading', bytes: 41_666_256, total: TOTAL_BYTES },
  { _tag: 'Downloading', bytes: 41_666_257, total: TOTAL_BYTES },
  { _tag: 'Downloading', bytes: TOTAL_BYTES - 1, total: TOTAL_BYTES },
  { _tag: 'Downloading', bytes: TOTAL_BYTES, total: TOTAL_BYTES },
  { _tag: 'Downloading', bytes: TOTAL_BYTES + 9, total: TOTAL_BYTES },
  { _tag: 'Downloading', bytes: 5, total: 0 },
];

const random = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
};

/** The percent shown: the largest whole p in 0-100 with p · total ≤ 100 · bytes, found by counting, and 0 when there is no total. */
const percentBySearch = (bytes: number, total: number): number => {
  if (total <= 0) return 0;
  const scaled = BigInt(Math.trunc(bytes)) * 100n;
  let p = 0;
  while (p < 100 && BigInt(p + 1) * BigInt(total) <= scaled) p += 1;
  return p;
};

/** D3's table, row by row, in its words. */
const expected = (view: NaturalView): { text: string; retry: boolean } | 'none' => {
  if (view.choice === 'off') return 'none';
  if (view.said)
    return {
      text: 'The natural voice stopped unexpectedly, so the system voice reads for now.',
      retry: false,
    };
  const download = view.download;
  if (download._tag === 'Failed') {
    if (download.reason === 'network')
      return { text: 'Natural voice could not download.', retry: true };
    if (download.reason === 'check')
      return { text: 'Natural voice could not be checked.', retry: true };
    if (download.reason === 'space')
      return { text: 'Not enough space for the natural voice (83 MB).', retry: true };
    return { text: 'Natural voice could not start.', retry: true };
  }
  if (download._tag === 'Waiting')
    return { text: 'Natural voice: waiting for a connection', retry: false };
  if (download._tag === 'Downloading')
    return {
      text: `Natural voice: downloading, ${percentBySearch(download.bytes, download.total)}%`,
      retry: false,
    };
  if (download._tag === 'Loading') return { text: 'Natural voice: getting ready', retry: false };
  return 'none';
};

const views = function* (downloads: ReadonlyArray<Download>): Generator<NaturalView> {
  for (const download of downloads)
    for (const fuse of ['clear', 'blown'] as const)
      for (const said of [false, true])
        for (const choice of CHOICES) yield { download, fuse, said, choice };
};

describe('the status line', () => {
  it('says D3’s words, the first row that holds, over every state, fuse, owed line and choice', () => {
    const next = random(0x6c696e65);
    const generated: Array<Download> = [];
    for (let i = 0; i < 4_000; i += 1) {
      const total =
        next() < 0.1 ? Math.floor(next() * 3) - 1 : 1 + Math.floor(next() * TOTAL_BYTES);
      const bytes = Math.floor(next() * total * 1.2);
      generated.push({ _tag: 'Downloading', bytes: Math.max(0, bytes), total });
    }
    let cases = 0;
    for (const view of views([...FIXED, ...generated])) {
      const got = Option.getOrElse(lineOf(view), () => 'none' as const);
      expect(got, JSON.stringify(view)).toEqual(expected(view));
      cases += 1;
    }
    expect(cases).toBe(48_192);
  });

  it('floors the percent, never rounds it, and holds it to 0-100', () => {
    const at = (bytes: number, total: number) =>
      Option.getOrThrow(
        lineOf({
          download: { _tag: 'Downloading', bytes, total },
          fuse: 'clear',
          said: false,
          choice: 'her',
        }),
      ).text;
    expect(at(41_666_256, TOTAL_BYTES)).toBe('Natural voice: downloading, 49%');
    expect(at(41_666_257, TOTAL_BYTES)).toBe('Natural voice: downloading, 50%');
    expect(at(TOTAL_BYTES - 1, TOTAL_BYTES)).toBe('Natural voice: downloading, 99%');
    expect(at(TOTAL_BYTES + 9, TOTAL_BYTES)).toBe('Natural voice: downloading, 100%');
    expect(at(5, 0)).toBe('Natural voice: downloading, 0%');
  });
});

describe('the stored fuse and who reads', () => {
  it('takes only the exact text `blown` as blown', () => {
    expect(storedFuse(Option.some('blown'))).toBe('blown');
    for (const text of ['clear', 'Blown', 'blown ', 'yes', '', 'true'])
      expect(storedFuse(Option.some(text)), text).toBe('clear');
    expect(storedFuse(Option.none())).toBe('clear');
  });

  it('reads naturally only when the voice is ready and the fuse clear', () => {
    for (const view of views(FIXED))
      expect(reads(view), JSON.stringify(view)).toBe(
        view.download._tag === 'Ready' && view.fuse === 'clear',
      );
  });
});

const machines = function* (): Generator<Machine> {
  for (const view of views(FIXED))
    for (const complete of [false, true])
      for (const started of [false, true])
        for (const again of [false, true]) yield { view, complete, started, again };
};

const INPUTS: ReadonlyArray<Input> = [
  { _tag: 'Begin', choice: 'off' },
  { _tag: 'Begin', choice: 'her' },
  { _tag: 'Begin', choice: 'him' },
  { _tag: 'Chosen', choice: 'off' },
  { _tag: 'Chosen', choice: 'her' },
  { _tag: 'Chosen', choice: 'him' },
  { _tag: 'Retry' },
  { _tag: 'Progress', bytes: 1_000, total: TOTAL_BYTES },
  { _tag: 'Waiting' },
  { _tag: 'Done' },
  { _tag: 'Failed', reason: 'network' },
  { _tag: 'Failed', reason: 'check' },
  { _tag: 'Failed', reason: 'space' },
  { _tag: 'Failed', reason: 'cancelled' },
  { _tag: 'Failed', reason: 'odd' },
  { _tag: 'Refused' },
  { _tag: 'Loaded' },
  { _tag: 'LoadFailed', reason: 'missing' },
  { _tag: 'LoadFailed', reason: 'check' },
  { _tag: 'LoadFailed', reason: 'busy' },
];

const START: Download = { _tag: 'Downloading', bytes: 0, total: TOTAL_BYTES };

const installs = (calls: ReadonlyArray<Call>) =>
  calls.filter((call) => call._tag === 'Install').length;
const loads = (calls: ReadonlyArray<Call>) => calls.filter((call) => call._tag === 'Load').length;
const fuses = (calls: ReadonlyArray<Call>) =>
  calls.flatMap((call) => (call._tag === 'Fuse' ? [call.fuse] : []));

/** One step: the machine before, the input, the machine after and the calls, and the step's name for a failure. */
interface Seen {
  readonly before: Machine;
  readonly input: Input;
  readonly after: Machine;
  readonly calls: ReadonlyArray<Call>;
  readonly name: string;
}

const unmoved = (seen: Seen) =>
  expect({ after: seen.after, calls: seen.calls }, seen.name).toEqual({
    after: seen.before,
    calls: [],
  });

const holdsBegin = ({ before, input, after, calls, name }: Seen, choice: Choice) => {
  expect(after.view.choice, name).toBe(choice);
  expect(fuses(calls), name).toEqual([]);
  if (choice === 'off') return expect(calls, name).toEqual([]);
  expect(after.started, name).toBe(true);
  expect({ loads: loads(calls), installs: installs(calls) }, `${name} ${input._tag}`).toEqual(
    before.complete ? { loads: 1, installs: 0 } : { loads: 0, installs: 1 },
  );
};

const holdsChosen = ({ before, after, calls, name }: Seen, choice: Choice) => {
  expect(after.view.choice, name).toBe(choice);
  expect(after.view.fuse, name).toBe('clear');
  expect(after.view.said, name).toBe(false);
  expect(fuses(calls), name).toEqual(before.view.fuse === 'blown' ? ['clear'] : []);
  const starts = choice !== 'off' && !before.started && before.view.download._tag === 'Idle';
  expect(installs(calls), name).toBe(starts && !before.complete ? 1 : 0);
  expect(loads(calls), name).toBe(starts && before.complete ? 1 : 0);
  if (!starts) expect(after.view.download, name).toEqual(before.view.download);
};

const holdsRetry = (seen: Seen) => {
  const download = seen.before.view.download;
  if (download._tag !== 'Failed') return unmoved(seen);
  const byLoad = download.reason === 'load';
  expect(loads(seen.calls), seen.name).toBe(byLoad ? 1 : 0);
  expect(installs(seen.calls), seen.name).toBe(byLoad ? 0 : 1);
  if (!byLoad) expect(seen.after.again, seen.name).toBe(false);
};

const isInstalling = (download: Download) => ['Downloading', 'Waiting'].includes(download._tag);

const whileInstalling = (seen: Seen, check: () => void) => {
  if (!isInstalling(seen.before.view.download)) return unmoved(seen);
  check();
};

const whileLoading = (seen: Seen, check: () => void) => {
  if (seen.before.view.download._tag !== 'Loading') return unmoved(seen);
  check();
};

const holdsLoadFailed = ({ before, after, calls, name }: Seen, reason: string) => {
  const bad = reason === 'missing' || reason === 'check';
  if (bad && !before.again) {
    expect(installs(calls), name).toBe(1);
    expect({ again: after.again, complete: after.complete }, name).toEqual({
      again: true,
      complete: false,
    });
    return;
  }
  expect(calls, name).toEqual([]);
  expect(after.view.download, name).toEqual({ _tag: 'Failed', reason: bad ? 'check' : 'load' });
};

/** The rule each input owns, written from D2 input by input. */
const quietlyTo = ({ after, calls, name }: Seen, download: Download) =>
  expect({ download: after.view.download, calls }, name).toEqual({ download, calls: [] });

const holds = (seen: Seen): void =>
  Match.type<Input>().pipe(
    Match.tagsExhaustive({
      Opened: () => expect(seen.after.view.download, seen.name).toEqual({ _tag: 'Idle' }),
      Begin: ({ choice }) => holdsBegin(seen, choice),
      Chosen: ({ choice }) => holdsChosen(seen, choice),
      Retry: () => holdsRetry(seen),
      Progress: ({ bytes, total }) =>
        whileInstalling(seen, () => quietlyTo(seen, { _tag: 'Downloading', bytes, total })),
      Waiting: () => whileInstalling(seen, () => quietlyTo(seen, { _tag: 'Waiting' })),
      Done: () =>
        whileInstalling(seen, () => {
          expect(seen.after.complete, seen.name).toBe(true);
          expect(loads(seen.calls), seen.name).toBe(1);
        }),
      Failed: ({ reason }) =>
        whileInstalling(seen, () =>
          quietlyTo(
            seen,
            reason === 'network' || reason === 'check' || reason === 'space'
              ? { _tag: 'Failed', reason }
              : { _tag: 'Idle' },
          ),
        ),
      Refused: () => quietlyTo(seen, { _tag: 'Unsupported' }),
      Loaded: () =>
        whileLoading(seen, () => {
          quietlyTo(seen, { _tag: 'Ready' });
          expect(seen.after.again, seen.name).toBe(false);
        }),
      LoadFailed: ({ reason }) => whileLoading(seen, () => holdsLoadFailed(seen, reason)),
    }),
  )(seen.input);

const holdsCalls = ({ input, before, after, calls, name }: Seen) => {
  for (const call of calls) {
    if (call._tag === 'Install') expect(after.view.download, name).toEqual(START);
    if (call._tag === 'Load')
      expect({ tag: after.view.download._tag, choice: call.choice }, name).toEqual({
        tag: 'Loading',
        choice: after.view.choice,
      });
  }
  expect(installs(calls) + loads(calls), name).toBeLessThanOrEqual(1);
  if (input._tag !== 'Chosen')
    expect({ fuse: after.view.fuse, said: after.view.said }, name).toEqual({
      fuse: before.view.fuse,
      said: before.view.said,
    });
};

describe('the reducer over every input from every machine', () => {
  it('asks only the calls each input owns, and ignores an input outside its states', () => {
    let steps = 0;
    for (const before of machines())
      for (const input of INPUTS) {
        const { machine: after, calls } = step(before, input);
        const seen = { before, input, after, calls, name: JSON.stringify({ before, input }) };
        holdsCalls(seen);
        holds(seen);
        steps += 1;
      }
    expect(steps).toBe(1_536 * 20);
  });

  it('opens a launch Idle, blowing and storing the fuse after a crash and owing the line that launch alone', () => {
    for (const complete of [false, true])
      for (const stored of ['clear', 'blown'] as const) {
        const crash = step(closed, { _tag: 'Opened', complete, crashed: true, stored });
        expect(crash.calls).toEqual([{ _tag: 'Fuse', fuse: 'blown' }]);
        expect(crash.machine.view).toEqual({
          download: { _tag: 'Idle' },
          fuse: 'blown',
          said: true,
          choice: 'off',
        });
        expect(crash.machine.complete).toBe(complete);
        const calm = step(closed, { _tag: 'Opened', complete, crashed: false, stored });
        expect(calm.calls).toEqual([]);
        expect(calm.machine.view).toEqual({
          download: { _tag: 'Idle' },
          fuse: stored,
          said: false,
          choice: 'off',
        });
      }
  });
});

const run = (inputs: ReadonlyArray<Input>) => {
  let machine = closed;
  const calls: Array<Call> = [];
  for (const input of inputs) {
    const stepped = step(machine, input);
    machine = stepped.machine;
    calls.push(...stepped.calls);
  }
  return { machine, calls };
};

const OPEN: Input = { _tag: 'Opened', complete: false, crashed: false, stored: 'clear' };

describe('a launch, walked', () => {
  it('starts the download by itself at most once: at launch when Voice is on, else at the first tap that turns it on', () => {
    const onAtLaunch = run([
      OPEN,
      { _tag: 'Begin', choice: 'her' },
      { _tag: 'Failed', reason: 'cancelled' },
    ]);
    expect(installs(onAtLaunch.calls)).toBe(1);
    const taps = run([
      OPEN,
      { _tag: 'Begin', choice: 'her' },
      { _tag: 'Failed', reason: 'cancelled' },
      { _tag: 'Chosen', choice: 'him' },
      { _tag: 'Chosen', choice: 'off' },
      { _tag: 'Chosen', choice: 'her' },
    ]);
    expect(installs(taps.calls)).toBe(1);
    expect(taps.machine.view.download).toEqual({ _tag: 'Idle' });

    const offAtLaunch = run([OPEN, { _tag: 'Begin', choice: 'off' }]);
    expect(offAtLaunch.calls).toEqual([]);
    const firstTap = run([
      OPEN,
      { _tag: 'Begin', choice: 'off' },
      { _tag: 'Chosen', choice: 'her' },
    ]);
    expect(firstTap.calls).toEqual([{ _tag: 'Install' }]);
    expect(lineOf(firstTap.machine.view)).toEqual(
      Option.some({ text: 'Natural voice: downloading, 0%', retry: false }),
    );
  });

  it('turning Voice Off hides the line and cancels nothing; turning it on again shows it with no new install', () => {
    const off = run([
      OPEN,
      { _tag: 'Begin', choice: 'her' },
      { _tag: 'Failed', reason: 'space' },
      { _tag: 'Chosen', choice: 'him' },
      { _tag: 'Chosen', choice: 'off' },
    ]);
    expect(lineOf(off.machine.view)).toEqual(Option.none());
    const back = step(off.machine, { _tag: 'Chosen', choice: 'her' });
    expect(back.calls).toEqual([]);
    expect(Option.map(lineOf(back.machine.view), (line) => line.text)).toEqual(
      Option.some('Not enough space for the natural voice (83 MB).'),
    );
  });

  it('loads at once when every file is there, with the pack of the choice', () => {
    const him = run([
      { ...OPEN, complete: true },
      { _tag: 'Begin', choice: 'him' },
    ]);
    expect(him.calls).toEqual([{ _tag: 'Load', choice: 'him' }]);
    const ready = step(him.machine, { _tag: 'Loaded' });
    expect(ready.machine.view.download).toEqual({ _tag: 'Ready' });
    expect(lineOf(ready.machine.view)).toEqual(Option.none());
  });

  it('fetches a bad file once again when the load finds it, then says it could not be checked, and Try again fetches anew', () => {
    const walked = run([
      { ...OPEN, complete: true },
      { _tag: 'Begin', choice: 'her' },
      { _tag: 'LoadFailed', reason: 'check' },
      { _tag: 'Done' },
      { _tag: 'LoadFailed', reason: 'missing' },
    ]);
    expect(walked.calls).toEqual([
      { _tag: 'Load', choice: 'her' },
      { _tag: 'Install' },
      { _tag: 'Load', choice: 'her' },
    ]);
    expect(walked.machine.view.download).toEqual({ _tag: 'Failed', reason: 'check' });
    const retried = step(walked.machine, { _tag: 'Retry' });
    expect(retried.calls).toEqual([{ _tag: 'Install' }]);
    expect(retried.machine.again).toBe(false);
  });

  it('retries a failed load by loading, and a failed download by fetching', () => {
    const failedLoad = run([
      { ...OPEN, complete: true },
      { _tag: 'Begin', choice: 'him' },
      { _tag: 'LoadFailed', reason: 'busy' },
      { _tag: 'Retry' },
    ]);
    expect(failedLoad.calls).toEqual([
      { _tag: 'Load', choice: 'him' },
      { _tag: 'Load', choice: 'him' },
    ]);
    const failedDownload = run([
      OPEN,
      { _tag: 'Begin', choice: 'her' },
      { _tag: 'Failed', reason: 'network' },
      { _tag: 'Retry' },
    ]);
    expect(installs(failedDownload.calls)).toBe(2);
  });

  it('a platform with no module is Unsupported: no line, never retried, no tap starts it', () => {
    const refused = run([
      OPEN,
      { _tag: 'Begin', choice: 'her' },
      { _tag: 'Refused' },
      { _tag: 'Retry' },
      { _tag: 'Chosen', choice: 'him' },
    ]);
    expect(installs(refused.calls)).toBe(1);
    expect(refused.machine.view.download).toEqual({ _tag: 'Unsupported' });
    expect(lineOf(refused.machine.view)).toEqual(Option.none());
  });

  it('after a crash says the line once, keeps it as the load lands, and the next tap clears it and the fuse', () => {
    const crashed = run([
      { _tag: 'Opened', complete: true, crashed: true, stored: 'clear' },
      { _tag: 'Begin', choice: 'her' },
      { _tag: 'Loaded' },
    ]);
    expect(crashed.calls).toEqual([
      { _tag: 'Fuse', fuse: 'blown' },
      { _tag: 'Load', choice: 'her' },
    ]);
    expect(reads(crashed.machine.view)).toBe(false);
    expect(Option.map(lineOf(crashed.machine.view), (line) => line.retry)).toEqual(
      Option.some(false),
    );
    const tapped = step(crashed.machine, { _tag: 'Chosen', choice: 'off' });
    expect(tapped.calls).toEqual([{ _tag: 'Fuse', fuse: 'clear' }]);
    expect(tapped.machine.view.said).toBe(false);
    expect(reads(tapped.machine.view)).toBe(true);
    const again = step(tapped.machine, { _tag: 'Chosen', choice: 'her' });
    expect(again.calls).toEqual([]);

    const later = run([
      { _tag: 'Opened', complete: true, crashed: false, stored: 'blown' },
      { _tag: 'Begin', choice: 'her' },
      { _tag: 'Loaded' },
    ]);
    expect(lineOf(later.machine.view)).toEqual(Option.none());
    expect(reads(later.machine.view)).toBe(false);
  });
});
