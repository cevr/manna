/* oxlint-disable effect/noGlobals, effect/noNullish -- a test rig: it records log annotations as JSON text, and its generators pick from plain lists whose picks may be undefined. */

/**
 * The passages' rig: the generators of ranges and stored values the
 * passages' tests draw from (hskjv's domain checklist), and a launch of the
 * `Passages` service over the app's real store on the device's
 * `One.Database` stand-in (`test/one.tsx`), whose read waits pass at once,
 * so a test of three failed reads takes no real time. The logs a launch
 * writes are kept, so a test can hold them to the rule that no log carries
 * a verse.
 */

import { Clock, Context, Effect, Layer, Logger, References, Scope } from 'effect';

import { readVerses } from '../../vite/passage';
import { layer, Passages } from '../passages';
import { store } from '../store';
import { clockOf, START } from './clock';
import { below } from './garden-model';
import { corpusOf, type Span, storedText, versesIn } from './passages-model';

/** The model's corpus, from the KJV's own rows. */
export const CORPUS = corpusOf(readVerses());

/** The verse count of a chapter in the model's corpus, 0 for one it does not hold. */
export const countIn = (book: number, chapter: number) => versesIn(CORPUS, book, chapter).length;

/** Each stored value that does not decode, by name. */
export const GARBLED = [
  ['not JSON', '[{"book":1,'],
  ['null', 'null'],
  ['an object', '{"book":43,"chapter":15,"first":1,"last":5}'],
  ['an array of numbers', '[1,2,3]'],
  ['a field missing', '[{"book":43,"chapter":15,"first":1}]'],
  ['a string field', '[{"book":"43","chapter":15,"first":1,"last":5}]'],
  ['a fraction', '[{"book":43,"chapter":15,"first":1.5,"last":5}]'],
  ['out of its chapter', '[{"book":43,"chapter":15,"first":1,"last":28}]'],
  ['first after last', '[{"book":43,"chapter":15,"first":5,"last":1}]'],
  [
    'a valid entry then a bad one',
    '[{"book":43,"chapter":15,"first":1,"last":5},{"book":67,"chapter":1,"first":1,"last":1}]',
  ],
] as const;

/** Each kind of range a reader may not add. */
export const INVALID = [
  '21+ verses',
  'reversed',
  'past the chapter',
  'chapter 0',
  'past the book',
  'book 0',
  'book 67',
  'a fraction',
  'verse 0',
] as const;

/** A chapter of the canon, from `next`. */
export const chapterOf = (next: () => number) => {
  const book = CORPUS.books[below(next, CORPUS.books.length)] ?? 1;
  const chapter = 1 + below(next, CORPUS.counts.get(book) ?? 1);
  return { book, chapter, count: countIn(book, chapter) };
};

/** A choosable range and its kind, from `next`: one verse, 2-19, exactly 20, a whole short chapter, one over the promise's verse (book 23, 41:10), or a repeat of or an overlap with one of `held`. */
export const choosableOf = (
  next: () => number,
  held: ReadonlyArray<Span>,
): readonly [string, Span] => {
  const roll = below(next, 7);
  const kept = held[below(next, Math.max(1, held.length))];
  if (roll === 0 && kept !== undefined && kept.last - kept.first < 20)
    return ['a passage held', { ...kept }];
  if (roll === 1 && kept !== undefined && kept.last - kept.first < 19) {
    const last = Math.min(countIn(kept.book, kept.chapter), kept.last + 1);
    return ['an overlap', { ...kept, first: Math.max(1, last - 19), last }];
  }
  if (roll === 2) {
    const first = 1 + below(next, 10);
    return [
      'over the promise',
      { book: 23, chapter: 41, first, last: Math.min(29, first + 9 + below(next, 10)) },
    ];
  }
  const { book, chapter, count } = chapterOf(next);
  if (roll === 3 && count <= 20)
    return ['a whole short chapter', { book, chapter, first: 1, last: count }];
  if (roll === 4 && count >= 20) {
    const first = 1 + below(next, count - 19);
    return ['exactly 20', { book, chapter, first, last: first + 19 }];
  }
  const first = 1 + below(next, count);
  if (roll === 5) return ['one verse', { book, chapter, first, last: first }];
  return [
    '2-19 verses',
    { book, chapter, first, last: Math.min(count, first + 1 + below(next, 18)) },
  ];
};

/** A range of `kind`, which a reader may not add, from `next`. */
export const unchoosableOf = (next: () => number, kind: (typeof INVALID)[number]): Span => {
  const { book, chapter, count } = chapterOf(next);
  if (kind === '21+ verses') {
    const first = 1 + below(next, 176 - 21);
    return { book: 19, chapter: 119, first, last: Math.min(176, first + 20 + below(next, 20)) };
  }
  if (kind === 'reversed') return { book: 19, chapter: 119, first: 2 + below(next, 5), last: 1 };
  if (kind === 'past the chapter') return { book, chapter, first: count, last: count + 1 };
  if (kind === 'chapter 0') return { book, chapter: 0, first: 1, last: 1 };
  if (kind === 'past the book')
    return { book, chapter: (CORPUS.counts.get(book) ?? 0) + 1, first: 1, last: 1 };
  if (kind === 'book 0') return { book: 0, chapter: 1, first: 1, last: 1 };
  if (kind === 'book 67') return { book: 67, chapter: 1, first: 1, last: 1 };
  if (kind === 'a fraction') return { book, chapter, first: 1, last: 1.5 };
  return { book, chapter, first: 0, last: Math.min(count, 2) };
};

/** A device's stored value and its name, from `next`: no key, `[]`, one of `GARBLED` (by `seed`), or one to five choosable ranges, with a range of Psalms 119 past 20 verses in a third, and the first repeated in half. */
export const storedOf = (
  next: () => number,
  seed: number,
): readonly [string, string | undefined] => {
  const roll = below(next, 20);
  if (roll < 3) return ['no key', undefined];
  if (roll < 5) return ['[]', '[]'];
  if (roll < 9) {
    const [name, text] = GARBLED[seed % GARBLED.length] ?? GARBLED[0];
    return [`garbled: ${name}`, text];
  }
  const list: Span[] = [];
  for (let n = 1 + below(next, 5); n > 0; n--) list.push(choosableOf(next, list)[1]);
  if (below(next, 3) === 0)
    list.push({ book: 19, chapter: 119, first: 1, last: 21 + below(next, 156) });
  if (below(next, 2) === 0 && list[0] !== undefined)
    list.splice(1 + below(next, list.length), 0, { ...list[0] });
  return [`stored ${list.length}`, storedText(list)];
};

/** Effect's clock at the tests' default instant with sleeps that end at once. */
export const instantSleeps = Layer.effect(
  Clock.Clock,
  Effect.map(Clock.Clock, (clock): Clock.Clock => ({
    ...clock,
    sleep: () => Effect.void,
  })),
).pipe(Layer.provide(clockOf({ now: START })));

/** A logger that keeps each line in `logs`, its message and its annotations as text, and prints nothing. */
export const keptLogs = (logs: string[]) =>
  Logger.layer([
    Logger.make((options) =>
      logs.push(
        `${[options.message].flat().map(String).join(' ')} ${JSON.stringify(options.fiber.getRef(References.CurrentLogAnnotations))}`,
      ),
    ),
  ]);

/** One launch of the passages over the device as it stands: the service, a runner for its calls, and every log line written. */
export const launchPassages = Effect.gen(function* () {
  const logs: string[] = [];
  const scope = yield* Scope.make();
  const services = yield* Layer.buildWithScope(
    layer.pipe(
      Layer.provide(store),
      Layer.provideMerge(Layer.merge(instantSleeps, keptLogs(logs))),
    ),
    scope,
  );
  /** Runs a call on the service under the launch's clock and logger, as the app's runtime runs it. */
  const run = <A,>(effect: Effect.Effect<A>) =>
    Effect.runPromise(Effect.provideContext(effect, services));
  return { passages: Context.get(services, Passages), run, scope, logs };
});
