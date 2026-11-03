import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Context, Effect, FileSystem, Layer, Match, Option, Path, Ref, Schema } from 'effect';

import {
  APPROVE,
  RECORD,
  STILLS_QUESTION,
  ApprovalUnsound,
  Approved,
  Given,
  approve,
  checkKept,
  hashedStills,
  pin,
  readRecord,
  savedAsk,
  servedStills,
  shippable,
  StillsMoved,
  StillsNotShown,
} from './approval.ts';
import { sha256 } from './build-walk.ts';
import {
  AskAnswer,
  type AskAnswers,
  type AskRead,
  AskUnknown,
  LabAsk,
  LabAsks,
} from './lab-asks.ts';
import { scratchApp } from './scratch-app.ts';

const APP = `${import.meta.dir}/..`;
const ASK = 'a1b2c3d4e5f';
const OTHER = 'f5e4d3c2b1a';
const AT = '2026-10-22T09:00:00.000Z';
const LAB = 'http://lab.test/';

const SHOWED = 'ab47076e90b';
const SHOWED_AT = '2026-10-22T01:56:06.332Z';
const SHOWED_STILLS = `${import.meta.dir}/fixtures/ask-${SHOWED}.stills`;
const SHOWED_SET = '/api/review/files/manna/ftb-motion-2026-10-21-approve/ship';
const SCREENSHOTS = 'adf28c17753';
const SCREENSHOTS_WAIT = `${import.meta.dir}/fixtures/ask-${SCREENSHOTS}.txt`;

const Shown = Schema.fromJsonString(Schema.Record(Schema.String, Schema.String));
const Body = Schema.fromJsonString(Schema.Unknown);

const savedAt = Effect.fn('test/savedAt')(function* (app: string, ask: string) {
  const fs = yield* FileSystem.FileSystem;
  const { record, shown } = savedAsk(ask);
  const body = yield* Schema.decodeEffect(Body)(yield* fs.readFileString(`${app}/${record}`));
  const read: AskRead = { record: yield* Schema.decodeUnknownEffect(LabAsk)(body), body };
  return {
    read,
    shown: yield* Schema.decodeEffect(Shown)(yield* fs.readFileString(`${app}/${shown}`)),
  };
});

const saved = (ask: string) => savedAt(APP, ask);

const copySaved = (root: string, ask: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    for (const file of Object.values(savedAsk(ask))) {
      yield* fs.makeDirectory(path.dirname(`${root}/${file}`), { recursive: true });
      yield* fs.copyFile(`${APP}/${file}`, `${root}/${file}`);
    }
  });

const RecordJson = Schema.fromJsonString(Approved, { space: 2 });

const recordAt = (root: string, record: Approved) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    yield* fs.writeFileString(
      `${root}/${RECORD}`,
      `${yield* Schema.encodeEffect(RecordJson)(record)}\n`,
    );
  });

const freshApp = Effect.gen(function* () {
  const root = yield* scratchApp(APP);
  const stills = Object.fromEntries(yield* hashedStills(root));
  yield* recordAt(root, { approval: { status: 'pending', ask: OTHER }, earlier: [], stills });
  return root;
});

const printedAnswer = Effect.fn('test/printedAnswer')(function* (line: string) {
  const [, question = '', kind = ''] = line.split(' ');
  const fields = Array.from(line.matchAll(/(\w+)=("[^"]*"|\S+)/g), ([, key = '', given = '']) => [
    key,
    given.replace(/^"|"$/g, ''),
  ]);
  const answer = yield* Schema.decodeUnknownEffect(AskAnswer)({
    kind,
    ...Object.fromEntries(fields),
  });
  return [question, answer] as const;
});

const SWAY: AskAnswers[string] = { kind: 'choose', value: 'keep', label: 'Keep the sway as it is' };
const YES: AskAnswers[string] = { kind: 'choose', value: APPROVE, label: 'Approve these stills' };
const NOTE: AskAnswers[string] = { kind: 'free_text', text: 'The light is right.' };

const APPROVED: AskAnswers = {
  sway: SWAY,
  [STILLS_QUESTION]: YES,
  stills_note: NOTE,
  trace: { kind: 'skipped' },
};

const valueOf = (answer: AskAnswers[string]) =>
  Match.value(answer).pipe(
    Match.when({ kind: 'choose' }, ({ value }) => [value]),
    Match.when({ kind: 'free_text' }, ({ text }) => [text]),
    Match.when({ kind: 'skipped' }, () => []),
    Match.exhaustive,
  );

const srcOf = (name: string) => `/api/review/files/test/${name}`;

const held = (
  answers: AskAnswers,
  shows: ReadonlyArray<string>,
  tag: LabAsk['state']['_tag'] = 'Answered',
  id = ASK,
  others: ReadonlyArray<string> = [],
  unreached: ReadonlyArray<string> = [],
): LabAsk => {
  const values = Object.entries(answers).flatMap(([question, answer]) =>
    valueOf(answer).map((value) => [question, value] as const),
  );
  const steps = [
    { step: 'look', values: {}, at: AT },
    { step: 'approve', values: Object.fromEntries(values), at: AT },
  ];
  const images = shows.map((src) => ({ kind: 'image', image: { src } }));
  const half = Math.ceil(images.length / 2);
  const look = [{ kind: 'video' }, { kind: 'image', image: {} }, ...images.slice(0, half)];
  const approve = [
    ...others.map((src) => ({ kind: 'board', image: { src } })),
    ...images.slice(half),
    { kind: 'choose' },
  ];
  const branch = unreached.map((src) => ({ kind: 'image', image: { src } }));
  return {
    id,
    ask: {
      steps: {
        look: { blocks: look },
        approve: { blocks: approve },
        revise: { blocks: branch },
        end: {},
      },
    },
    state: { _tag: tag, answers },
    answered: steps.filter(() => Object.keys(answers).length > 0),
  };
};

const imageSrcs = (ask: LabAsk) => [
  ...new Set(
    Object.values(ask.ask.steps).flatMap(({ blocks = [] }) =>
      blocks
        .filter(({ kind }) => kind === 'image')
        .flatMap(({ image }) =>
          Option.toArray(
            Option.flatMap(Option.fromUndefinedOr(image), ({ src }) => Option.fromUndefinedOr(src)),
          ),
        ),
    ),
  ),
];

const withReceipt = (ask: LabAsk, files: Readonly<Record<string, string>>): LabAsk => ({
  ...ask,
  shown: Object.fromEntries(Object.entries(files).filter(([src]) => imageSrcs(ask).includes(src))),
});

class Held extends Context.Service<Held, Ref.Ref<ReadonlyArray<AskRead>>>()('test/HeldAsks') {}

const layerHeld = Layer.effect(
  LabAsks,
  Effect.gen(function* () {
    const holding = yield* Held;
    return LabAsks.of({
      url: LAB,
      read: (ask) =>
        Ref.get(holding).pipe(
          Effect.flatMap((asks) =>
            Effect.fromOption(Option.fromUndefinedOr(asks.find(({ record }) => record.id === ask))),
          ),
          Effect.mapError(() => AskUnknown.make({ ask })),
        ),
    });
  }),
).pipe(Layer.provideMerge(Layer.effect(Held, Ref.make<ReadonlyArray<AskRead>>([]))));

const holdingReads = (asks: ReadonlyArray<AskRead>) =>
  Effect.gen(function* () {
    yield* Ref.set(yield* Held, asks);
  });

const asRead = (record: LabAsk): AskRead => ({ record, body: record });

const holding = (asks: ReadonlyArray<LabAsk>, files: Readonly<Record<string, string>> = {}) =>
  holdingReads(asks.map((ask) => asRead(withReceipt(ask, files))));

const showing = (stills: Approved['stills']) =>
  Object.fromEntries(Object.entries(stills).map(([still, hash]) => [srcOf(still), hash]));

const only = (stills: Approved['stills'], named: ReadonlyArray<string>) =>
  Object.fromEntries(named.map((still) => [still, stills[still] ?? '']));

const scramble = (root: string, still: string, next: () => number) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    yield* fs.writeFile(
      `${root}/${still}`,
      Uint8Array.from({ length: 64 }, () => Math.floor(next() * 256)),
    );
  });

const twinned = (root: string, still: string, twin: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    yield* fs.writeFile(`${root}/${still}`, yield* fs.readFile(`${root}/${twin}`));
  });

const pinOn = (root: string, ask: string) =>
  Effect.gen(function* () {
    yield* holding([held({}, [], 'Asking', ask)]);
    return yield* pin(root, ask);
  });

const pinnedOn = (ask: string) =>
  Effect.gen(function* () {
    const root = yield* freshApp;
    const { stills } = yield* pinOn(root, ask);
    return { root, stills };
  });

const approvedShowing = (root: string, ask: string, files: Readonly<Record<string, string>>) =>
  Effect.gen(function* () {
    yield* holding([held(APPROVED, Object.keys(files), 'Answered', ask)], files);
    return yield* approve(root, ask);
  });

const approvedOn = (root: string, ask: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const before = yield* fs.readFileString(`${root}/${RECORD}`);
    const result = yield* approve(root, ask).pipe(
      Effect.match({ onFailure: (error) => error._tag, onSuccess: () => 'approved' }),
    );
    const kept = (yield* fs.readFileString(`${root}/${RECORD}`)) === before;
    return [result, kept] as const;
  });

const draws = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
};

const rewritten = (root: string, still: string, all: ReadonlyArray<string>, next: () => number) => {
  const others = all.filter((other) => other !== still);
  const twin = Option.filter(
    Option.fromUndefinedOr(others[Math.floor(next() * others.length)]),
    () => next() < 0.5,
  );
  return Option.match(twin, {
    onNone: () => scramble(root, still, next),
    onSome: (copied) => twinned(root, still, copied),
  });
};

const STEPS = ['look', 'approve', 'revise'];

type Placed = ReadonlyArray<readonly [string, string]>;

const drawnAsk = (
  id: string,
  state: LabAsk['state'],
  files: Readonly<Record<string, string>>,
  stills: Approved['stills'],
  next: () => number,
) => {
  const wild = next() < 0.5;
  const open = STEPS.slice(0, 2 + Number(wild));
  const placed: Placed = Object.keys(files).map(
    (src) => [src, open[Math.floor(next() * open.length)] ?? 'look'] as const,
  );
  const reachedOnce = STEPS.filter((step) => (!wild && step !== 'revise') || next() < 0.7);
  const names = [
    ...reachedOnce,
    ...['gone'].filter(() => next() < 0.25),
    ...reachedOnce.filter(() => next() < 0.3),
  ]
    .map((step) => [next(), step] as const)
    .toSorted(([a], [b]) => a - b)
    .map(([, step]) => step);
  const extra = Object.fromEntries(
    Object.entries(stills)
      .filter(() => next() < 0.15)
      .map(([still, hash]) => [srcOf(`unshown/${still}`), hash]),
  );
  const receipt = {
    ...Object.fromEntries(Object.entries(files).filter(() => !wild || next() < 0.85)),
    ...extra,
  };
  const values = Object.fromEntries(
    Object.entries(APPROVED).flatMap(([question, given]) =>
      valueOf(given).map((value) => [question, value] as const),
    ),
  );
  const blocksOn = (step: string) =>
    placed.filter(([, on]) => on === step).map(([src]) => ({ kind: 'image', image: { src } }));
  const ask: LabAsk = {
    id,
    ask: {
      steps: {
        look: { blocks: [{ kind: 'video' }, { kind: 'image', image: {} }, ...blocksOn('look')] },
        approve: { blocks: [...blocksOn('approve'), { kind: 'choose' }] },
        revise: { blocks: blocksOn('revise') },
        end: {},
      },
    },
    shown: receipt,
    state,
    answered: names.map((step) => ({
      step,
      values: Object.fromEntries(Object.entries(values).filter(() => step === 'approve')),
      at: AT,
    })),
  };
  return { ask, placed, names, receipt, extra };
};

const shownOnSteps = (
  placed: Placed,
  receipt: Readonly<Record<string, string>>,
  steps: ReadonlyArray<string>,
) =>
  Object.fromEntries(
    placed
      .filter(([src, on]) => steps.includes(on) && Object.hasOwn(receipt, src))
      .map(([src]) => [src, receipt[src] ?? ''] as const),
  );

const refusedWhy = (
  drawn: {
    readonly placed: Placed;
    readonly names: ReadonlyArray<string>;
    readonly receipt: Readonly<Record<string, string>>;
    readonly extra: Readonly<Record<string, string>>;
    readonly files: Readonly<Record<string, string>>;
    readonly stills: Approved['stills'];
    readonly notShown: ReadonlyArray<string>;
  },
  fewer: (files: Readonly<Record<string, string>>) => boolean,
) => {
  const { placed, names, receipt, extra, files, stills, notShown } = drawn;
  const reachedFiles = Object.fromEntries(
    placed.filter(([, on]) => names.includes(on)).map(([src]) => [src, files[src] ?? ''] as const),
  );
  return [
    ...['refused: shown only on an unreached step'].filter(() =>
      fewer(shownOnSteps(placed, receipt, STEPS)),
    ),
    ...['refused: a reached file the receipt holds no hash of'].filter(() => fewer(reachedFiles)),
    ...['refused: held only by a receipt entry no block names'].filter(() => fewer(extra)),
    ...['refused: two stills of one hash, both named'].filter(() =>
      notShown.some((a) => notShown.some((b) => a !== b && stills[a] === stills[b])),
    ),
  ];
};

const test = it.effect.layer(Layer.mergeAll(BunServices.layer, layerHeld));

const notShownBy = (root: string, ask: string) =>
  approve(root, ask).pipe(
    Effect.flip,
    Effect.map((error) =>
      Option.map(Option.liftPredicate(error, Schema.is(StillsNotShown)), (found) => found.stills),
    ),
  );

const verdictOf = <A, E extends { readonly _tag: string }, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.match({
      onFailure: (error) =>
        Option.match(Option.liftPredicate(error, Schema.is(ApprovalUnsound)), {
          onNone: () => error._tag,
          onSome: ({ ask, why }) => `${ask} ${why}`,
        }),
      onSuccess: () => 'passes',
    }),
  );

const LabAskJson = Schema.fromJsonString(LabAsk, { space: 2 });

const resave = (root: string, ask: string, change: (record: LabAsk) => LabAsk) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const { read } = yield* savedAt(root, ask);
    const file = `${root}/${savedAsk(ask).record}`;
    yield* fs.writeFileString(file, yield* Schema.encodeEffect(LabAskJson)(change(read.record)));
  });

const rerecord = (root: string, change: (record: Approved) => Approved) =>
  Effect.flatMap(readRecord(root), (record) => recordAt(root, change(record)));

describe('kit:approve', () => {
  test("approves the pinned stills an image block showed byte for byte, on the approve choice, storing the lab, the answer's label and the shown files' hashes", () =>
    Effect.gen(function* () {
      const { root, stills } = yield* pinnedOn(ASK);
      const files = { ...showing(stills), [srcOf('crop.png')]: sha256(new Uint8Array([1])) };
      yield* holding([held(APPROVED, Object.keys(files))], files);
      expect(yield* approvedOn(root, ASK)).toEqual(['approved', false]);
      expect(yield* readRecord(root)).toEqual({
        approval: {
          status: 'approved',
          ask: ASK,
          lab: LAB,
          answered: AT,
          answer: 'Approve these stills',
          answers: { sway: SWAY, [STILLS_QUESTION]: YES, stills_note: NOTE },
          shown: files,
        },
        earlier: [],
        stills,
      });
    }).pipe(Effect.scoped));

  test("refuses the owner's real answer to ask ab47076e90b as it holds no receipt, and it stays an earlier approval of the stills it showed, each kept by its path with the hash it showed", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const real = yield* saved(SHOWED);
      const kept = (yield* fs.readDirectory(SHOWED_STILLS, { recursive: true }))
        .filter((entry) => /\.(jpg|png|webp)$/.test(entry))
        .toSorted();
      expect(kept).toHaveLength(9);
      for (const still of kept) {
        const hash = sha256(yield* fs.readFile(`${SHOWED_STILLS}/${still}`));
        expect([still, hash]).toEqual([
          still,
          real.shown[`${SHOWED_SET}/${path.basename(still)}`] ?? 'none',
        ]);
      }
      const root = yield* freshApp;
      yield* Effect.forEach(kept, (still) =>
        Effect.flatMap(fs.readFile(`${SHOWED_STILLS}/${still}`), (bytes) =>
          fs.writeFile(`${root}/${still}`, bytes),
        ),
      );
      const since = (yield* servedStills(root)).filter((still) => !kept.includes(still));
      yield* Effect.forEach(since, (still) => fs.remove(`${root}/${still}`));
      yield* holdingReads([real.read]);
      expect((yield* pin(root, SHOWED).pipe(Effect.flip))._tag).toBe('AskUnreceipted');
      yield* rerecord(root, (record) => ({
        ...record,
        approval: { status: 'pending', ask: SHOWED },
      }));
      expect(yield* approvedOn(root, SHOWED)).toEqual(['AskUnreceipted', true]);
      const given: Given = {
        status: 'approved',
        ask: SHOWED,
        lab: LAB,
        answered: SHOWED_AT,
        answer: 'Approve them',
        answers: { [STILLS_QUESTION]: { kind: 'choose', value: APPROVE, label: 'Approve them' } },
        shown: real.shown,
      };
      yield* copySaved(root, SHOWED);
      yield* rerecord(root, (record) => ({ ...record, approval: given }));
      const { stills, earlier } = yield* pinOn(root, ASK);
      expect(Object.keys(stills).toSorted()).toEqual(kept);
      expect(earlier).toEqual([given]);
      yield* holding([held(APPROVED, [], 'Answered', ASK)]);
      expect(yield* approvedOn(root, ASK)).toEqual(['approved', false]);
      const record = yield* readRecord(root);
      expect([record.approval, record.earlier]).toMatchObject([{ ask: ASK, shown: {} }, [given]]);
    }).pipe(Effect.scoped));

  test("refuses the owner's real answer to ask adf28c17753 as it holds no receipt, and with its saved hashes as one, as its image blocks showed screenshots of the page, not the stills, naming each still", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const real = yield* saved(SCREENSHOTS);
      const lines = (yield* fs.readFileString(SCREENSHOTS_WAIT))
        .split('\n')
        .filter((line) => line.startsWith('answer '));
      expect(Object.fromEntries(yield* Effect.forEach(lines, printedAnswer))).toEqual(
        real.read.record.state.answers,
      );
      const { root, stills } = yield* pinnedOn(SCREENSHOTS);
      yield* holdingReads([real.read]);
      expect(yield* approvedOn(root, SCREENSHOTS)).toEqual(['AskUnreceipted', true]);
      yield* holdingReads([{ ...real.read, record: { ...real.read.record, shown: real.shown } }]);
      expect(yield* notShownBy(root, SCREENSHOTS)).toEqual(
        Option.some(Object.keys(stills).toSorted()),
      );
      expect((yield* readRecord(root)).approval.status).toBe('pending');
    }).pipe(Effect.scoped));

  test('the committed record is on an ask saved beside it, each approval it keeps held by its saved ask, and every still was shown byte for byte', () =>
    Effect.gen(function* () {
      const { approval, earlier, stills } = yield* readRecord(APP);
      const given = [approval].filter(Schema.is(Given));
      yield* checkKept(APP, approval.ask, given, earlier);
      const pending = yield* Effect.forEach(
        [approval].filter(({ status }) => status === 'pending'),
        ({ ask }) => saved(ask),
      );
      for (const real of pending) {
        expect(real.read.record.id).toBe(approval.ask);
        expect(imageSrcs(real.read.record).toSorted()).toEqual(Object.keys(real.shown).toSorted());
      }
      expect(earlier.every(({ status }) => status === 'approved')).toBe(true);
      const hashes = new Set(
        [...given, ...earlier, ...pending].flatMap(({ shown }) => Object.values(shown)),
      );
      expect(Object.keys(stills).filter((still) => !hashes.has(stills[still] ?? ''))).toEqual([]);
    }));

  test('pin saves the ask as the lab gives it with its receipt, and approve saves it again as answered with the receipt of the steps he reached', () =>
    Effect.gen(function* () {
      const root = yield* freshApp;
      const { stills } = yield* readRecord(root);
      const files = showing(stills);
      const branch = srcOf('revised.png');
      const all = { ...files, [branch]: sha256(Uint8Array.from([3])) };
      const asking = withReceipt(held({}, Object.keys(files), 'Asking', ASK, [], [branch]), all);
      const answered = withReceipt(
        held(APPROVED, Object.keys(files), 'Answered', ASK, [], [branch]),
        all,
      );
      const asked = { ...asking, served: 'as the lab gave it' };
      yield* holdingReads([{ record: asking, body: asked }]);
      yield* pin(root, ASK);
      expect(yield* savedAt(root, ASK)).toEqual({
        read: { record: asking, body: asked },
        shown: all,
      });
      const given = { ...answered, served: 'answered' };
      yield* holdingReads([{ record: answered, body: given }]);
      expect(yield* approvedOn(root, ASK)).toEqual(['approved', false]);
      expect(yield* savedAt(root, ASK)).toEqual({
        read: { record: answered, body: given },
        shown: files,
      });
    }).pipe(Effect.scoped));

  test('an earlier approval keeps the stills unchanged since: a later ask need show only the changed still, and a still changed since no ask showed is refused', () =>
    Effect.gen(function* () {
      const next = draws(7);
      const { root, stills } = yield* pinnedOn(ASK);
      const [changed = '', after = '', ...rest] = Object.keys(stills).toSorted();
      const first = yield* approvedShowing(root, ASK, showing(stills));
      yield* scramble(root, changed, next);
      const repinned = yield* pinOn(root, OTHER);
      expect(repinned.earlier).toEqual([first.approval]);
      yield* holding([held(APPROVED, [srcOf('decoy.png')], 'Answered', OTHER)], {
        [srcOf('decoy.png')]: sha256(Uint8Array.from([7])),
      });
      expect(yield* notShownBy(root, OTHER)).toEqual(Option.some([changed]));
      const second = yield* approvedShowing(root, OTHER, showing(only(repinned.stills, [changed])));
      expect(second.earlier).toEqual([first.approval]);
      const THIRD = 'e1e2e3e4e5e';
      yield* scramble(root, after, next);
      const third = yield* pinOn(root, THIRD);
      expect(third.earlier).toEqual([second.approval, first.approval]);
      yield* holding(
        [held(APPROVED, Object.keys(showing(only(third.stills, rest))), 'Answered', THIRD)],
        showing(only(third.stills, rest)),
      );
      expect(yield* notShownBy(root, THIRD)).toEqual(Option.some([after]));
      expect((yield* readRecord(root)).approval).toEqual({ status: 'pending', ask: THIRD });
    }).pipe(Effect.scoped));

  test('pin drops each approval that shows no pinned still, and approve drops each earlier one whose stills its ask showed', () =>
    Effect.gen(function* () {
      const next = draws(11);
      const { root, stills } = yield* pinnedOn(ASK);
      const first = yield* approvedShowing(root, ASK, showing(stills));
      const again = yield* pinOn(root, OTHER);
      expect(again.earlier).toEqual([first.approval]);
      const second = yield* approvedShowing(root, OTHER, showing(again.stills));
      expect(second.earlier).toEqual([]);
      const THIRD = 'e1e2e3e4e5e';
      yield* Effect.forEach(Object.keys(stills), (still) => scramble(root, still, next));
      expect((yield* pinOn(root, THIRD)).earlier).toEqual([]);
    }).pipe(Effect.scoped));

  test('refuses each pinned still no image block on a step he reached showed byte for byte, naming each: one shown as a crop, one in a block of another kind, one on a step his answers did not reach', () =>
    Effect.gen(function* () {
      const { root, stills } = yield* pinnedOn(ASK);
      const [first = '', second = '', third = '', ...rest] = Object.keys(stills).toSorted();
      const files = {
        ...showing(only(stills, rest)),
        [srcOf(`crop-of-${first}`)]: sha256(new TextEncoder().encode(first)),
      };
      const board = srcOf(`board-of-${second}`);
      const branch = srcOf(third);
      yield* holding([held(APPROVED, Object.keys(files), 'Answered', ASK, [board], [branch])], {
        ...files,
        [board]: stills[second] ?? '',
        [branch]: stills[third] ?? '',
      });
      expect(yield* notShownBy(root, ASK)).toEqual(Option.some([first, second, third]));
      expect((yield* readRecord(root)).approval.status).toBe('pending');
    }).pipe(Effect.scoped));

  test('refuses an ask the lab does not hold, and one whose record holds no receipt, on pin and approve; a file its receipt has no hash of shows nothing', () =>
    Effect.gen(function* () {
      const { root, stills } = yield* pinnedOn(ASK);
      const [first = ''] = Object.keys(stills).toSorted();
      yield* holding([]);
      expect(yield* approvedOn(root, ASK)).toEqual(['AskUnknown', true]);
      yield* holdingReads([asRead(held(APPROVED, Object.keys(showing(stills))))]);
      expect(yield* approvedOn(root, ASK)).toEqual(['AskUnreceipted', true]);
      expect((yield* pin(root, ASK).pipe(Effect.flip))._tag).toBe('AskUnreceipted');
      const { [srcOf(first)]: _, ...unreceipted } = showing(stills);
      yield* holding([held(APPROVED, Object.keys(showing(stills)))], unreceipted);
      expect(yield* notShownBy(root, ASK)).toEqual(Option.some([first]));
    }).pipe(Effect.scoped));

  test('refuses an ask the owner has not answered, and an answer to the stills question that is not the approve choice', () =>
    Effect.gen(function* () {
      const { root, stills } = yield* pinnedOn(ASK);
      const shows = Object.keys(showing(stills));
      yield* holding([held({}, shows, 'Asking')], showing(stills));
      expect(yield* approvedOn(root, ASK)).toEqual(['AskUnanswered', true]);
      yield* holding([held({ sway: SWAY }, shows)], showing(stills));
      expect(yield* approvedOn(root, ASK)).toEqual(['AskUnanswered', true]);
      const REVISE: AskAnswers[string] = { kind: 'choose', value: 'revise', label: 'Revise them' };
      for (const answer of [REVISE, NOTE, { kind: 'skipped' } as const]) {
        yield* holding([held({ [STILLS_QUESTION]: answer }, shows)], showing(stills));
        expect(yield* approvedOn(root, ASK)).toEqual(['AskNotApproval', true]);
      }
    }).pipe(Effect.scoped));

  test('refuses a record not pending on the ask, and an approval already given', () =>
    Effect.gen(function* () {
      const { root, stills } = yield* pinnedOn(OTHER);
      yield* holding([held(APPROVED, Object.keys(showing(stills)))], showing(stills));
      expect(yield* approvedOn(root, ASK)).toEqual(['RecordNotPending', true]);
      const once = yield* pinnedOn(ASK);
      yield* holding([held(APPROVED, Object.keys(showing(once.stills)))], showing(once.stills));
      expect(yield* approvedOn(once.root, ASK)).toEqual(['approved', false]);
      expect(yield* approvedOn(once.root, ASK)).toEqual(['RecordNotPending', true]);
    }).pipe(Effect.scoped));

  test('refuses stills other than the ones the record pinned, naming each', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const { root, stills } = yield* pinnedOn(ASK);
      const card = yield* fs.readFile(`${root}/public/og/home.jpg`);
      yield* fs.writeFile(`${root}/public/og/land.jpg`, card);
      yield* fs.writeFile(`${root}/public/og/about.jpg`, card);
      yield* holding([held(APPROVED, Object.keys(showing(stills)))], showing(stills));
      const refusal = yield* approve(root, ASK).pipe(
        Effect.flip,
        Effect.map((error) => Option.liftPredicate(error, Schema.is(StillsMoved))),
      );
      expect(Option.map(refusal, (found) => found.stills)).toEqual(
        Option.some([
          { still: 'public/og/about.jpg', why: 'not in the record' },
          { still: 'public/og/land.jpg', why: 'changed' },
        ]),
      );
      expect((yield* readRecord(root)).approval.status).toBe('pending');
    }).pipe(Effect.scoped));

  test('pins only on an ask the lab holds', () =>
    Effect.gen(function* () {
      const root = yield* scratchApp(APP);
      yield* holding([]);
      const refusal = yield* pin(root, ASK).pipe(Effect.flip);
      expect(refusal._tag).toBe('AskUnknown');
    }).pipe(Effect.scoped));

  test('approve and shippable refuse each kept approval its saved ask does not hold: no saved ask, one of another ask, not answered approve, other files than it saved, its receipt or the steps he reached, a repeat of the current ask', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const EARLY = 'e0e0e0e0e0e';
      const { root, stills } = yield* pinnedOn(EARLY);
      const first = yield* approvedShowing(root, EARLY, showing(stills));
      yield* pinOn(root, ASK);
      const [src = ''] = Object.keys(first.approval.shown);
      const other = sha256(Uint8Array.from([9]));
      const kase = <E, R>(ask: string, why: string, change: Effect.Effect<unknown, E, R>) =>
        [`${ask} ${why}`, change] as const;
      const cases = [
        kase(EARLY, 'has no saved ask', fs.remove(`${root}/${savedAsk(EARLY).record}`)),
        kase(
          EARLY,
          'has no saved ask',
          resave(root, EARLY, (record) => ({ ...record, id: OTHER })),
        ),
        kase(
          EARLY,
          'is not answered approve in its saved ask',
          resave(root, EARLY, (record) => ({
            ...record,
            state: { ...record.state, _tag: 'Asking' },
          })),
        ),
        kase(
          EARLY,
          'is not answered approve in its saved ask',
          resave(root, EARLY, (record) => ({
            ...record,
            state: {
              ...record.state,
              answers: { [STILLS_QUESTION]: { kind: 'choose', value: 'revise', label: 'Revise' } },
            },
          })),
        ),
        kase(
          EARLY,
          'shows other files than its saved ask',
          Effect.flatMap(
            Schema.encodeEffect(Shown)({ ...first.approval.shown, [src]: other }),
            (text) => fs.writeFileString(`${root}/${savedAsk(EARLY).shown}`, text),
          ),
        ),
        kase(
          EARLY,
          'shows other files than its saved ask',
          resave(root, EARLY, (record) => ({
            ...record,
            shown: { ...record.shown, [src]: other },
          })),
        ),
        kase(
          EARLY,
          'shows other files than its saved ask',
          resave(root, EARLY, (record) => ({
            ...record,
            answered: record.answered.filter(({ step }) => step !== 'look'),
          })),
        ),
        kase(
          ASK,
          'repeats the current ask',
          rerecord(root, (record) => ({
            ...record,
            earlier: [...record.earlier, { ...first.approval, ask: ASK }],
          })),
        ),
      ];
      const files = [RECORD, ...Object.values(savedAsk(EARLY)), ...Object.values(savedAsk(ASK))];
      const verdicts = <E extends { readonly _tag: string }, R>(
        check: Effect.Effect<unknown, E, R>,
        changes: ReadonlyArray<readonly [string, Effect.Effect<unknown, unknown, R>]>,
      ) =>
        Effect.gen(function* () {
          const found: Array<string> = [];
          for (const [, change] of changes) {
            const before = yield* Effect.forEach(files, (file) =>
              Effect.option(fs.readFileString(`${root}/${file}`)),
            );
            yield* change;
            found.push(yield* verdictOf(check));
            yield* Effect.forEach(files, (file, i) =>
              Option.match(before[i] ?? Option.none(), {
                onNone: () => Effect.void,
                onSome: (text) => fs.writeFileString(`${root}/${file}`, text),
              }),
            );
          }
          return found;
        });
      yield* holding([held(APPROVED, [], 'Answered', ASK)]);
      expect(yield* verdicts(approve(root, ASK), cases)).toEqual(cases.map(([why]) => why));
      expect(yield* verdictOf(approve(root, ASK))).toBe('passes');
      const record = yield* readRecord(root);
      expect([record.approval, record.earlier]).toMatchObject([
        { status: 'approved', ask: ASK, shown: {} },
        [first.approval],
      ]);
      const owns = kase(ASK, 'has no saved ask', fs.remove(`${root}/${savedAsk(ASK).record}`));
      const kept = Effect.flatMap(readRecord(root), ({ approval, earlier }) =>
        checkKept(root, approval.ask, [approval].filter(Schema.is(Given)), earlier),
      );
      expect(yield* verdicts(shippable(root), [...cases, owns])).toEqual(
        [...cases, owns].map(([why]) => why),
      );
      expect(yield* verdictOf(kept)).toBe('passes');
    }).pipe(Effect.scoped));

  test('over random pinned stills, some byte copies of others, image blocks on random steps, answers reaching any of them, and receipts missing and adding entries, approves only stills a reached block showed by the receipt, or an approval it gave, and refuses a re-pin after it to bytes not shown', () =>
    Effect.gen(function* () {
      const root = yield* freshApp;
      const next = draws(54);
      const real = yield* saved(SHOWED);
      const ANSWERS: ReadonlyArray<readonly [string, (answers: AskAnswers) => LabAsk['state']]> = [
        ['approve', (answers) => ({ _tag: 'Answered', answers })],
        ['approve, closed', (answers) => ({ _tag: 'Closed', answers })],
        ['approve, still asking', (answers) => ({ _tag: 'Asking', answers })],
        [
          'revise',
          (answers) => ({
            _tag: 'Answered',
            answers: {
              ...answers,
              [STILLS_QUESTION]: { kind: 'choose', value: 'revise', label: 'Revise' },
            },
          }),
        ],
        [
          'keep prod cards',
          (answers) => ({
            _tag: 'Answered',
            answers: {
              ...answers,
              [STILLS_QUESTION]: { kind: 'choose', value: 'keep_prod_cards', label: 'Keep' },
            },
          }),
        ],
        [
          'words',
          (answers) => ({
            _tag: 'Answered',
            answers: { ...answers, [STILLS_QUESTION]: { kind: 'free_text', text: APPROVE } },
          }),
        ],
        [
          'skipped',
          (answers) => ({
            _tag: 'Answered',
            answers: { ...answers, [STILLS_QUESTION]: { kind: 'skipped' } },
          }),
        ],
        ['unanswered', ({ [STILLS_QUESTION]: _, ...answers }) => ({ _tag: 'Answered', answers })],
      ];
      let given = Option.none<Given>();
      let kept: ReadonlyArray<Given> = [];
      const pinModel = (ask: string, stills: Approved['stills']) => {
        const pinned = new Set(Object.values(stills));
        kept = [...Option.toArray(given), ...kept].filter(
          (approval) =>
            approval.ask !== ask && Object.values(approval.shown).some((hash) => pinned.has(hash)),
        );
        given = Option.none();
      };
      const unshownOf = (stills: Approved['stills'], files: Readonly<Record<string, string>>) => {
        const hashes = new Set([
          ...Object.values(files),
          ...kept.flatMap((approval) => Object.values(approval.shown)),
        ]);
        return Object.keys(stills)
          .filter((still) => !hashes.has(stills[still] ?? ''))
          .toSorted();
      };
      const expectedOf = (
        answer: string,
        reachesChoice: boolean,
        notShown: ReadonlyArray<string>,
      ) => {
        if (answer === 'approve, still asking' || answer === 'unanswered') return 'AskUnanswered';
        if (!answer.startsWith('approve')) return 'AskNotApproval';
        if (!reachesChoice) return 'AskUnanswered';
        if (notShown.length > 0) return 'StillsNotShown';
        return 'approved';
      };
      const seen = new Set<string>();
      for (let i = 0; i < 40; i += 1) {
        const ask = `c${i.toString(16).padStart(10, '0')}`;
        const { stills: before } = yield* readRecord(root);
        const scrambled = Object.keys(before).filter(() => next() < 0.3);
        for (const still of scrambled) yield* rewritten(root, still, Object.keys(before), next);
        const { stills, earlier } = yield* pinOn(root, ask);
        pinModel(ask, stills);
        expect([i, earlier]).toEqual([i, kept]);
        const shownStills = Object.keys(stills).filter(() => next() < 0.85);
        const files = {
          ...showing(only(stills, shownStills)),
          ...Object.fromEntries(
            scrambled.map((still) => [srcOf(`old/${still}`), before[still] ?? '']),
          ),
          [srcOf('decoy.png')]: sha256(Uint8Array.from([i])),
        };
        const drawn = Option.fromUndefinedOr(
          ANSWERS[Math.max(0, Math.floor(next() * ANSWERS.length * 2) - ANSWERS.length)],
        );
        if (Option.isNone(drawn)) return yield* Effect.die(new Error('no answer drawn'));
        const [answer, stateOf] = drawn.value;
        const {
          ask: ofAsk,
          placed,
          names,
          receipt,
          extra,
        } = drawnAsk(ask, stateOf(APPROVED), files, stills, next);
        yield* holdingReads([asRead(ofAsk), real.read]);
        const shownHim = shownOnSteps(placed, receipt, names);
        const notShown = unshownOf(stills, shownHim);
        const expected = expectedOf(answer, names.includes('approve'), notShown);
        seen.add(expected);
        if (expected === 'StillsNotShown')
          for (const why of refusedWhy(
            { placed, names, receipt, extra, files, stills, notShown },
            (more) => unshownOf(stills, { ...shownHim, ...more }).length < notShown.length,
          ))
            seen.add(why);
        const hashes = new Set(Object.values(shownHim));
        if (expected === 'approved' && Object.values(stills).some((hash) => !hashes.has(hash)))
          seen.add('approved by an earlier approval');
        expect([i, answer, yield* approvedOn(root, SHOWED)]).toEqual([
          i,
          answer,
          ['RecordNotPending', true],
        ]);
        expect([i, answer, yield* approvedOn(root, ask)]).toEqual([
          i,
          answer,
          [expected, expected !== 'approved'],
        ]);
        if (expected === 'StillsNotShown')
          expect(yield* notShownBy(root, ask)).toEqual(Option.some(notShown));
        if (expected !== 'approved') continue;
        const record = yield* readRecord(root);
        expect([i, record.approval]).toMatchObject([i, { status: 'approved', ask }]);
        given = Option.liftPredicate(record.approval, Schema.is(Given));
        expect([i, Option.map(given, (approval) => approval.shown)]).toEqual([
          i,
          Option.some(shownHim),
        ]);
        const unseen = new Set(Object.values(stills).filter((hash) => !hashes.has(hash)));
        kept = kept.filter((approval) =>
          Object.values(approval.shown).some((hash) => unseen.has(hash)),
        );
        expect([i, record.earlier]).toEqual([i, kept]);
        if (next() < 0.5) continue;
        const moved = Object.keys(stills)[Math.floor(next() * Object.keys(stills).length)] ?? '';
        yield* scramble(root, moved, next);
        const repinned = yield* pin(root, ask);
        pinModel(ask, repinned.stills);
        expect([i, repinned.earlier]).toEqual([i, kept]);
        expect([i, 'a re-pin after the answer', yield* approvedOn(root, ask)]).toEqual([
          i,
          'a re-pin after the answer',
          ['StillsNotShown', true],
        ]);
        seen.add('re-pin refused');
      }
      expect([...seen].toSorted()).toEqual([
        'AskNotApproval',
        'AskUnanswered',
        'StillsNotShown',
        'approved',
        'approved by an earlier approval',
        're-pin refused',
        'refused: a reached file the receipt holds no hash of',
        'refused: held only by a receipt entry no block names',
        'refused: shown only on an unreached step',
        'refused: two stills of one hash, both named',
      ]);
    }).pipe(Effect.scoped));
});
