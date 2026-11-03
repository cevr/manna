import { Array as Arr, Option, Result, Schema } from 'effect';
import { type ShortError, ShortSpanEmpty, UnknownScene } from './errors.ts';
import { type Placed, pointIn } from './layout.ts';
import type { ScenePoint, Short, ShortSpan } from './schema.ts';
import { CLOCK_EPSILON, frameRead, secondsAt } from './time.ts';

export const SHORT_WIDTH = 1080;
const SHORT_HEIGHT = 1920;

interface ShortCut {
  readonly scene: string;
  readonly from: number;
  readonly to: number;
  readonly at: number;
  readonly shift: number;
}

export interface ResolvedShort {
  readonly id: string;
  readonly title: string;
  readonly spans: readonly [ShortCut, ...ShortCut[]];
  readonly duration: number;
  readonly fps: number;
}

export const SHORT_LAYOUT = {
  centre: 540,
  hook: { y: 445, width: 800, hold: 2.4, fade: 0.4 },
  band: { top: 620 },
  caption: { y: 1318, width: 800 },
} as const;

export interface SafeZone {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
  readonly columns: ReadonlyArray<ButtonColumn>;
}

interface ButtonColumn {
  readonly right: number;
  readonly from: number;
}

const shareOf = (share: number, size: number) => Math.ceil(share * size);

export const PLATFORM_ZONES = {
  youtube: {
    title: 'YouTube Shorts',
    zone: { top: 288, bottom: 672, left: 48, right: 192, columns: [] },
  },
  reels: {
    title: 'Instagram Reels',
    zone: {
      top: shareOf(0.14, SHORT_HEIGHT),
      bottom: shareOf(0.35, SHORT_HEIGHT),
      left: shareOf(0.06, SHORT_WIDTH),
      right: shareOf(0.06, SHORT_WIDTH),
      columns: [],
    },
  },
  tiktok: {
    title: 'TikTok',
    zone: { top: 240, bottom: 660, left: 120, right: 120, columns: [{ right: 300, from: 840 }] },
  },
} as const satisfies Record<string, { readonly title: string; readonly zone: SafeZone }>;

const unionOf = (zones: ReadonlyArray<SafeZone>): SafeZone => ({
  top: Math.max(...zones.map((z) => z.top)),
  bottom: Math.max(...zones.map((z) => z.bottom)),
  left: Math.max(...zones.map((z) => z.left)),
  right: Math.max(...zones.map((z) => z.right)),
  columns: zones.flatMap((z) => z.columns),
});

export const SAFE_ZONES = {
  default: { top: 270, bottom: 520, left: 65, right: 140, columns: [] },
  ads: { top: 270, bottom: Math.round(0.35 * SHORT_HEIGHT), left: 65, right: 140, columns: [] },
  platforms: unionOf(Object.values(PLATFORM_ZONES).map((p) => p.zone)),
} as const satisfies Record<string, SafeZone>;
export type SafeZoneName = keyof typeof SAFE_ZONES;
export const SAFE_ZONE_NAMES = [
  'default',
  'ads',
  'platforms',
] as const satisfies ReadonlyArray<SafeZoneName>;

export const safeRect = (zone: SafeZone) => ({
  left: zone.left,
  top: zone.top,
  right: SHORT_WIDTH - zone.right,
  bottom: SHORT_HEIGHT - zone.bottom,
});

export const roomAcross = (zone: SafeZone, bottom: number) => {
  const under = zone.columns.filter((c) => bottom > c.from);
  return {
    left: zone.left,
    right: SHORT_WIDTH - Math.max(zone.right, ...under.map((c) => c.right)),
  };
};

export const SHORT_RULES = {
  firstWord: 0.3,
  motionBy: 0.5,
  loopGap: 0.6,
  loopDiff: 0.08,
  loopGrid: { cols: 64, rows: 36 },
  length: { max: 90, from: 45, to: 75 },
} as const;

export const hookAlpha = (s: number): number => {
  const { hold, fade } = SHORT_LAYOUT.hook;
  return Math.min(1, Math.max(0, 1 - (s - hold) / fade));
};

export const shortKey = (film: string, id: string): string => `${film}/shorts/${id}`;

export const shortPage = (width: number) => ({
  width,
  height: Math.round((width * SHORT_HEIGHT) / SHORT_WIDTH / 2) * 2,
  scale: SHORT_WIDTH / width,
});

interface ShortBand {
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export const pageScale = (width: number) => width / SHORT_WIDTH;

export const bandOf = (film: { readonly width: number; readonly height: number }): ShortBand => ({
  top: Math.round(SHORT_LAYOUT.band.top * pageScale(film.width)),
  width: film.width,
  height: film.height,
});

export const SHORT_PREROLL = 0.1;

const openOnVoice = (p: Placed, at: number): number =>
  Option.match(
    Arr.findFirst(p.voice.words, (w) => w.end > at),
    {
      onNone: () => at,
      onSome: (w) => Math.max(at, w.voiced.start - SHORT_PREROLL),
    },
  );

const onVoice = (p: Placed, point: ScenePoint): Option.Option<number> => {
  const mark = Option.filter(Option.fromUndefinedOr(point.mark), () =>
    Option.isNone(Option.fromUndefinedOr(point.word)),
  );
  if (Option.isSome(mark)) return Option.fromUndefinedOr(p.voice.marks.get(mark.value));
  return Option.as(
    Option.filter(Option.fromUndefinedOr(point.at), (at) => at === 'speech'),
    0,
  );
};

const pointAt = (
  short: string,
  p: Placed,
  point: ScenePoint,
  edge: 'start' | 'end',
): Result.Result<number, ShortError> =>
  Result.map(pointIn(p, point, `short "${short}"`, edge), (at) =>
    Option.match(
      Option.filter(onVoice(p, point), () => edge === 'start'),
      {
        onNone: () => at,
        onSome: (voice) => p.speechStart + openOnVoice(p, voice),
      },
    ),
  );

const spanFrames = (
  short: string,
  placed: ReadonlyArray<Placed>,
  span: ShortSpan,
): Result.Result<
  { readonly scene: string; readonly from: number; readonly to: number; readonly fps: number },
  ShortError
> =>
  Result.gen(function* () {
    const p = yield* Result.fromOption(
      Arr.findFirst(placed, (q) => q.spec.id === span.scene),
      () =>
        UnknownScene.make({
          scene: span.scene,
          known: placed.map((q) => q.spec.id),
          by: `short "${short}"`,
        }),
    );
    const fps = p.fps;
    const from = p.frame + frameRead(yield* pointAt(short, p, span.from, 'start'), fps);
    const to = p.frame + frameRead(yield* pointAt(short, p, span.to, 'end'), fps);
    if (to <= from)
      return yield* Result.fail(
        ShortSpanEmpty.make({
          short,
          scene: span.scene,
          from: secondsAt(from, fps),
          to: secondsAt(to, fps),
        }),
      );
    return { scene: span.scene, from, to, fps };
  });

export const resolveShort = (
  placed: ReadonlyArray<Placed>,
  short: Short,
): Result.Result<ResolvedShort, ShortError> =>
  Result.map(
    Result.all(Arr.map(short.spans, (span) => spanFrames(short.id, placed, span))),
    (frames) => {
      const fps = frames[0].fps;
      const [length, spans] = Arr.mapAccum(frames, 0, (at, f): [number, ShortCut] => [
        at + f.to - f.from,
        {
          scene: f.scene,
          from: secondsAt(f.from, fps),
          to: secondsAt(f.to, fps),
          at: secondsAt(at, fps),
          shift: f.from - at,
        },
      ]);
      return { id: short.id, title: short.title, spans, duration: secondsAt(length, fps), fps };
    },
  );

export const shortSpanAt = (short: ResolvedShort, s: number): number => {
  const spans = short.spans;
  let i = spans.length - 1;
  while (i > 0 && s < (spans[i]?.at ?? 0) - CLOCK_EPSILON) i--;
  return i;
};

export const FilmPiece = Schema.Struct({ start: Schema.Finite, duration: Schema.Finite });
export type FilmPiece = typeof FilmPiece.Type;

export const shortPieces = (
  short: ResolvedShort,
  from: number,
  to: number,
): ReadonlyArray<FilmPiece> =>
  short.spans.flatMap((span) => {
    const a = Math.max(from, span.at);
    const b = Math.min(to, span.at + (span.to - span.from));
    if (b <= a + CLOCK_EPSILON) return [];
    return [{ start: span.from + (a - span.at), duration: b - a }];
  });
