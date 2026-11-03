import { Array as Arr, Match, Option, Order } from 'effect';
import type { Phrase } from '../core/phrases.ts';
import type { Probed, TextBox } from '../core/export-handle.ts';
import {
  PLATFORM_ZONES,
  type ResolvedShort,
  SAFE_ZONES,
  SHORT_RULES,
  type SafeZone,
  type SafeZoneName,
  roomAcross,
  safeRect,
} from '../core/shorts.ts';
import { TALK_FORMATS } from '../core/talk.ts';
import { CLOCK_EPSILON, frameAtOrAfter } from '../core/time.ts';
import { heldStill } from './check.ts';
import {
  type ShortFinding,
  ShortHook,
  ShortLength,
  ShortLoop,
  ShortUnsafeText,
} from './findings.ts';

interface Vertical {
  readonly id: string;
  readonly duration: number;
  readonly format?: keyof typeof TALK_FORMATS;
}

const lengthsOf = (film: Vertical) =>
  Option.match(Option.fromUndefinedOr(film.format), {
    onNone: () => SHORT_RULES.length,
    onSome: (format) => {
      const { min, max } = TALK_FORMATS[format].seconds;
      return { max, from: min, to: max };
    },
  });

export const shortLength = (film: Vertical): Option.Option<ShortLength> => {
  const { max, from, to } = lengthsOf(film);
  return Option.liftPredicate(
    ShortLength.make({ short: film.id, length: film.duration, max, from, to }),
    (f) => f.length > to + CLOCK_EPSILON || f.length < from - CLOCK_EPSILON,
  );
};

const wordsOf = (phrases: ReadonlyArray<Phrase>) => phrases.flatMap((p) => p.words);

export const hookWord = (
  short: Vertical,
  phrases: ReadonlyArray<Phrase>,
): Option.Option<ShortHook> => {
  const at = Option.match(Arr.head(wordsOf(phrases)), {
    onNone: () => short.duration,
    onSome: (w) => w.start,
  });
  return Option.liftPredicate(
    ShortHook.make({ short: short.id, reason: 'late word', at, max: SHORT_RULES.firstWord }),
    () => at > SHORT_RULES.firstWord + CLOCK_EPSILON,
  );
};

export const loopGap = (
  short: Vertical,
  phrases: ReadonlyArray<Phrase>,
): Option.Option<ShortLoop> => {
  const words = wordsOf(phrases);
  const gap = Option.match(Option.all([Arr.head(words), Arr.last(words)]), {
    onNone: () => short.duration,
    onSome: ([first, last]) => first.start + Math.max(0, short.duration - last.end),
  });
  return Option.liftPredicate(
    ShortLoop.make({ short: short.id, reason: 'gap', value: gap, max: SHORT_RULES.loopGap }),
    () => gap > SHORT_RULES.loopGap + CLOCK_EPSILON,
  );
};

export const shortStaticFindings = (
  short: Vertical,
  phrases: ReadonlyArray<Phrase>,
): ReadonlyArray<ShortFinding> => [
  ...Option.toArray(shortLength(short)),
  ...Option.toArray(hookWord(short, phrases)),
  ...Option.toArray(loopGap(short, phrases)),
];

export interface TalkVertical {
  readonly film: Vertical;
  readonly phrases: ReadonlyArray<Phrase>;
}

export const lumaDiff = (a: ReadonlyArray<number>, b: ReadonlyArray<number>): number => {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += Math.abs((a[i] ?? 0) - (b[i] ?? 0));
  return sum / n / 255;
};

export const loopPicture = (
  short: string,
  first: ReadonlyArray<number>,
  last: ReadonlyArray<number>,
): Option.Option<ShortLoop> => {
  const value = lumaDiff(first, last);
  return Option.liftPredicate(
    ShortLoop.make({ short, reason: 'picture', value, max: SHORT_RULES.loopDiff }),
    () => value > SHORT_RULES.loopDiff,
  );
};

const boxOf = (t: TextBox) => {
  const xs = t.corners.map(([x]) => x);
  const ys = t.corners.map(([, y]) => y);
  return {
    left: Math.min(...xs),
    right: Math.max(...xs),
    top: Math.min(...ys),
    bottom: Math.max(...ys),
  };
};

const SEEN = 0.05;

const byReach = Order.mapInput(Order.Number, (f: ShortUnsafeText) => f.by);

const pastSides = (zone: SafeZone, b: ReturnType<typeof boxOf>, k: number) => {
  const safe = safeRect(zone);
  const across = roomAcross(zone, b.bottom / k);
  return [
    { side: 'top' as const, by: safe.top - b.top / k },
    { side: 'bottom' as const, by: b.bottom / k - safe.bottom },
    { side: 'left' as const, by: across.left - b.left / k },
    { side: 'right' as const, by: b.right / k - across.right },
  ].filter((p) => p.by > 0.5);
};

const zoneLabel = (
  zone: SafeZoneName,
  side: 'top' | 'bottom' | 'left' | 'right',
  b: ReturnType<typeof boxOf>,
  k: number,
): string => {
  if (zone !== 'platforms') return zone;
  const under = Object.values(PLATFORM_ZONES)
    .filter((p) => pastSides(p.zone, b, k).some((s) => s.side === side))
    .map((p) => p.title);
  return `${zone} (${under.join(', ')})`;
};

export const unsafeTexts = (
  short: string,
  zone: SafeZoneName,
  at: number,
  probed: Probed,
  k: number,
): ReadonlyArray<ShortUnsafeText> =>
  probed.texts
    .filter((t) => t.alpha > SEEN && t.text.trim() !== '')
    .flatMap((t) => {
      const b = boxOf(t);
      const past = pastSides(SAFE_ZONES[zone], b, k).map((p) =>
        ShortUnsafeText.make({
          short,
          zone: zoneLabel(zone, p.side, b, k),
          text: t.text,
          at,
          side: p.side,
          by: p.by,
          own: t.caption === true,
          others: 0,
        }),
      );
      return Arr.match(past, {
        onEmpty: () => [],
        onNonEmpty: (some) => [Arr.max(some, byReach)],
      });
    });

export const mergeUnsafe = (
  found: ReadonlyArray<ShortUnsafeText>,
): ReadonlyArray<ShortUnsafeText> => {
  const merged = new Map<string, { finding: ShortUnsafeText; lines: Set<string> }>();
  for (const f of found) {
    const key = Match.value(f.own).pipe(
      Match.when(true, () => `own\u0000${f.side}`),
      Match.orElse(() => `film\u0000${f.side}\u0000${f.text}`),
    );
    const next = Option.match(Option.fromNullishOr(merged.get(key)), {
      onNone: () => ({ finding: f, lines: new Set([f.text]) }),
      onSome: (seen) => ({
        finding: ShortUnsafeText.make({
          ...seen.finding,
          at: Math.min(seen.finding.at, f.at),
          by: Math.max(seen.finding.by, f.by),
        }),
        lines: seen.lines.add(f.text),
      }),
    });
    merged.set(key, next);
  }
  return [...merged.values()].map(({ finding, lines }) =>
    ShortUnsafeText.make({ ...finding, others: lines.size - 1 }),
  );
};

export const openFrames = (fps: number): ReadonlyArray<number> => {
  const last = Math.round(SHORT_RULES.motionBy * fps);
  return Arr.dedupe([...Arr.makeBy(Math.floor(last / 2) + 1, (i) => i * 2), last]);
};

export const stillOpen = (
  short: string,
  frames: ReadonlyArray<Probed>,
  at: number,
): Option.Option<ShortHook> =>
  Option.liftPredicate(
    ShortHook.make({ short, reason: 'still open', at, max: SHORT_RULES.motionBy }),
    () => frames.length > 1 && heldStill(frames),
  );

const plain = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

export const titleOpen = (
  short: string,
  first: Probed,
  title: string,
): Option.Option<ShortHook> => {
  const want = plain(title);
  return Option.map(
    Arr.findFirst(
      first.texts,
      (t) => t.caption !== true && t.alpha > SEEN && want !== '' && plain(t.text).includes(want),
    ),
    (t) => ShortHook.make({ short, reason: 'title card', at: 0, max: 0, text: t.text }),
  );
};

export const zoneFrames = (
  short: Pick<ResolvedShort, 'duration' | 'fps'>,
  phrases: ReadonlyArray<Phrase>,
): ReadonlyArray<number> => {
  const frames = Math.round(short.duration * short.fps);
  const every = Arr.makeBy(Math.ceil(short.duration * 2), (i) => Math.round(i * 0.5 * short.fps));
  const starts = phrases.map((p) => frameAtOrAfter(p.start, short.fps));
  return Arr.sort(
    Arr.dedupe([...every, ...starts].filter((f) => f >= 0 && f < frames)),
    Order.Number,
  );
};
