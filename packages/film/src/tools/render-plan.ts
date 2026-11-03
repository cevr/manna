import { Array as Arr, Boolean as Bool, Data, Match, Option, Result } from 'effect';
import type { Address, Scope } from '../core/address.ts';
import type { RenderKind, RenderSound, RenderVariantName } from '../core/catalogue.ts';
import {
  type Copies,
  Encoder,
  copiesInPage,
  encoderName,
  hasMaster,
  hasShare,
  sharesInPage,
} from '../core/encoder.ts';
import { FlagsConflict, TooManyEncoders } from './errors.ts';
import type { Short } from '../core/schema.ts';
import { type SoundCredit, creditLink } from '../core/sfx.ts';
import { frameAtOrAfter } from '../core/time.ts';
import type { ExportInfo } from '../core/export-handle.ts';
import { Picture } from '../core/board-render.ts';
import { type FilmPiece, shortKey } from '../core/shorts.ts';

interface JobBase {
  readonly address: Address;
  readonly variant: RenderVariantName;
  readonly captions: boolean;
  readonly server: Option.Option<string>;
  readonly picture: Picture;
}

interface DrawJob extends JobBase {
  readonly workers: number;
}

export type Cut = Data.TaggedEnum<{
  Whole: {};
  Short: { readonly short: Short };
}>;
export const Cut = Data.taggedEnum<Cut>();

export type Reuse = Data.TaggedEnum<{
  Off: {};
  Keyed: { readonly beats: ReadonlyMap<string, string>; readonly fresh: boolean };
}>;
export const Reuse = Data.taggedEnum<Reuse>();

export const cutPage = (film: string, cut: Cut): string =>
  Cut.$match(cut, {
    Whole: () => film,
    Short: ({ short }) => shortKey(film, short.id),
  });

const slug = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9._]+/g, '-')
    .replace(/^-+|-+$/g, '');

const addressFolder = (address: Address): string =>
  Match.valueTags(address, {
    Film: () => 'film',
    Act: ({ act }) => `acts/${slug(act)}`,
    Scenes: ({ ids }) => `scenes/${ids.map(slug).join('+')}`,
    Short: ({ id }) => `shorts/${id}`,
  });

interface RenderPaths {
  readonly clip: string;
  readonly dir: string;
}

export const renderPaths = (project: string, address: Address, variant: string): RenderPaths => {
  const folder = `${project}/${addressFolder(address)}`;
  return { clip: `${folder}/${variant}.mp4`, dir: `${folder}/${variant}` };
};

export const captionsName = (video: string): string => `${video.replace(/\.[^./]+$/, '')}.vtt`;

export const chaptersName = (video: string): string =>
  `${video.replace(/\.[^./]+$/, '')}.chapters.txt`;

export const descriptionName = (video: string): string =>
  `${video.replace(/\.[^./]+$/, '')}.description.txt`;

export const videoDescription = (
  chapters: ReadonlyArray<string>,
  credits: ReadonlyArray<SoundCredit>,
): Option.Option<string> => {
  const sound = Arr.match(credits, {
    onEmpty: (): ReadonlyArray<string> => [],
    onNonEmpty: (owed) => ['Sound:', ...owed.map(creditLink)],
  });
  const paragraphs = [chapters, sound].filter(Arr.isReadonlyArrayNonEmpty);
  if (paragraphs.length === 0) return Option.none();
  return Option.some(`${paragraphs.map((lines) => lines.join('\n')).join('\n\n')}\n`);
};

export interface RenderOutput {
  readonly kind: RenderKind;
  readonly clip: Option.Option<string>;
  readonly share: Option.Option<string>;
  readonly captions: Option.Option<string>;
  readonly chapters: Option.Option<string>;
  readonly description: Option.Option<string>;
  readonly images: ReadonlyArray<string>;
  readonly sound: Option.Option<RenderSound>;
  readonly span: Scope['span'];
}

export const imagesOutput = (
  kind: RenderKind,
  images: ReadonlyArray<string>,
  span: Scope['span'] = Option.none(),
): RenderOutput => ({
  kind,
  clip: Option.none(),
  share: Option.none(),
  captions: Option.none(),
  chapters: Option.none(),
  description: Option.none(),
  images,
  sound: Option.none(),
  span,
});

export type RenderJob = Data.TaggedEnum<{
  Video: JobBase & {
    readonly workers: Option.Option<number>;
    readonly cut: Cut;
    readonly from: Option.Option<number>;
    readonly to: Option.Option<number>;
    readonly scale: number;
    readonly out: Option.Option<string>;
    readonly copies: Copies;
    readonly encoder: Option.Option<Encoder>;
    readonly reuse: Reuse;
  };
  Stills: DrawJob & { readonly cut: Cut; readonly times: ReadonlyArray<number> };
  Contact: JobBase & {
    readonly cut: Cut;
    readonly every: number;
    readonly from: Option.Option<number>;
    readonly to: Option.Option<number>;
  };
  LookBook: JobBase;
}>;
export const RenderJob = Data.taggedEnum<RenderJob>();

export type FlagRule = readonly [
  flag: string,
  rule: 'excludes' | 'needs',
  other: string,
  reason: string,
];

const broken = (given: ReadonlySet<string>, [flag, rule, other]: FlagRule) =>
  given.has(flag) && given.has(other) === (rule === 'excludes');

export const flagConflicts = (
  given: ReadonlySet<string>,
  rules: ReadonlyArray<FlagRule>,
): Result.Result<void, FlagsConflict> =>
  Option.match(
    Arr.findFirst(rules, (r) => broken(given, r)),
    {
      onNone: () => Result.void,
      onSome: ([flag, rule, other, reason]) =>
        Result.fail(FlagsConflict.make({ flag, rule, other, reason })),
    },
  );

export const givenFlags = (flags: Record<string, Option.Option<unknown>>): ReadonlySet<string> =>
  new Set(
    Object.entries(flags)
      .filter(([, value]) => Option.isSome(value))
      .map(([name]) => name),
  );

const STILLS = 'stills are drawn at the seconds --stills names';
const VIDEO = 'only a video takes it';
const RANGED = 'the address sets the range from the layout';

const RENDER_RULES: ReadonlyArray<FlagRule> = [
  ['stills', 'excludes', 'contact', 'a render writes stills or a contact sheet, not both'],
  ['stills', 'excludes', 'scene', STILLS],
  ['stills', 'excludes', 'act', STILLS],
  ['stills', 'excludes', 'from', STILLS],
  ['stills', 'excludes', 'to', STILLS],
  ['scene', 'excludes', 'from', RANGED],
  ['scene', 'excludes', 'to', RANGED],
  ['act', 'excludes', 'from', RANGED],
  ['act', 'excludes', 'to', RANGED],
  ['stills', 'excludes', 'scale', VIDEO],
  ['stills', 'excludes', 'out', VIDEO],
  ['stills', 'excludes', 'share', VIDEO],
  ['contact', 'excludes', 'scale', VIDEO],
  ['contact', 'excludes', 'out', VIDEO],
  ['contact', 'excludes', 'share', VIDEO],
  ['stills', 'excludes', 'share-only', VIDEO],
  ['contact', 'excludes', 'share-only', VIDEO],
  ['share-only', 'excludes', 'share', '--share-only writes the share copy and nothing else'],
  ['contact', 'excludes', 'workers', 'one page composes the whole sheet'],
  ['stills', 'excludes', 'encoder', VIDEO],
  ['contact', 'excludes', 'encoder', VIDEO],
  ['review', 'excludes', 'short', 'a short draws its own page, with no burn-in'],
  ['board', 'excludes', 'short', 'a short draws its own page, not the Board'],
  ['stills', 'excludes', 'fresh', VIDEO],
  ['contact', 'excludes', 'fresh', VIDEO],
  ['short', 'excludes', 'fresh', 'a short draws every frame, keeping no segment'],
];

const STRETCH = "a stretch is not the film's render: write it with --out";

const VIDEO_RULES: ReadonlyArray<FlagRule> = [
  ['from', 'needs', 'out', STRETCH],
  ['to', 'needs', 'out', STRETCH],
];

const addressFlag = (address: Address): Option.Option<string> =>
  Match.valueTags(address, {
    Film: () => Option.none(),
    Act: () => Option.some('act'),
    Scenes: () => Option.some('scene'),
    Short: () => Option.some('short'),
  });

interface RenderFlags {
  readonly variant: RenderVariantName;
  readonly captions: boolean;
  readonly workers: Option.Option<number>;
  readonly stills: Option.Option<ReadonlyArray<number>>;
  readonly contact: Option.Option<number>;
  readonly scope: Scope;
  readonly from: Option.Option<number>;
  readonly to: Option.Option<number>;
  readonly scale: Option.Option<number>;
  readonly out: Option.Option<string>;
  readonly share: Option.Option<boolean>;
  readonly shareOnly: boolean;
  readonly encoder: Option.Option<Encoder>;
  readonly server: Option.Option<string>;
  readonly board: boolean;
  readonly review: boolean;
  readonly reuse: Reuse;
}

export const pictureOf = (flags: { readonly board: boolean; readonly review: boolean }): Picture =>
  Bool.match(flags.board, {
    onTrue: () => Picture.Board({ review: flags.review }),
    onFalse: () => Picture.Scenes({ review: flags.review }),
  });

const freshOf = (reuse: Reuse): boolean =>
  Reuse.$match(reuse, { Off: () => false, Keyed: ({ fresh }) => fresh });

export const jobOf = (flags: RenderFlags): Result.Result<RenderJob, FlagsConflict> => {
  const given = new Set([
    ...givenFlags({
      stills: flags.stills,
      contact: flags.contact,
      from: flags.from,
      to: flags.to,
      scale: flags.scale,
      out: flags.out,
      share: flags.share,
      workers: flags.workers,
      encoder: flags.encoder,
    }),
    ...Option.toArray(addressFlag(flags.scope.address)),
    ...Arr.filter(['board'], () => flags.board),
    ...Arr.filter(['review'], () => flags.review),
    ...Arr.filter(['fresh'], () => freshOf(flags.reuse)),
    ...Arr.filter(['share-only'], () => flags.shareOnly),
  ]);
  const workers = Option.map(flags.workers, (n) => Math.max(1, n));
  const software = Option.exists(flags.encoder, (e) => !sharesInPage(e));
  const askedShare = Arr.findFirst(
    [
      ['share-only', flags.shareOnly],
      ['share', Option.getOrElse(flags.share, () => false)],
    ] as const,
    ([, asked]) => asked,
  );
  if (software && Option.isSome(askedShare))
    return Result.fail(
      FlagsConflict.make({
        flag: askedShare.value[0],
        rule: 'excludes',
        other: 'encoder software',
        reason: "the share copy is the hardware encoder's, made in the page",
      }),
    );
  const share = Option.getOrElse(flags.share, () => !flags.review && !software);
  const copies = Bool.match(flags.shareOnly, {
    onTrue: (): Copies => 'share',
    onFalse: (): Copies =>
      Bool.match(share, { onTrue: () => 'master+share', onFalse: () => 'master' }),
  });
  const base = {
    address: flags.scope.address,
    variant: flags.variant,
    captions: flags.captions,
    server: flags.server,
    picture: pictureOf(flags),
    cut: Option.match(flags.scope.short, {
      onNone: () => Cut.Whole(),
      onSome: (short) => Cut.Short({ short }),
    }),
  };
  const from = Option.orElse(
    Option.map(flags.scope.span, (s) => s.from),
    () => flags.from,
  );
  const to = Option.orElse(
    Option.map(flags.scope.span, (s) => s.to),
    () => flags.to,
  );
  const job = Option.match(flags.stills, {
    onSome: (times) =>
      RenderJob.Stills({
        ...base,
        workers: Option.getOrElse(workers, () => DRAW_WORKERS),
        times,
      }),
    onNone: () =>
      Option.match(flags.contact, {
        onSome: (every) => RenderJob.Contact({ ...base, every, from, to }),
        onNone: () =>
          RenderJob.Video({
            ...base,
            workers,
            from,
            to,
            scale: Option.getOrElse(flags.scale, () => 1),
            out: flags.out,
            copies,
            encoder: flags.encoder,
            reuse: flags.reuse,
          }),
      }),
  });
  const rules = Match.value(job).pipe(
    Match.tag('Video', () => [...RENDER_RULES, ...VIDEO_RULES]),
    Match.orElse(() => RENDER_RULES),
  );
  return Result.map(flagConflicts(given, rules), () => job);
};

export const DRAW_WORKERS = 6;

export const HARDWARE_WORKERS = 4;

export const MAX_HARDWARE_ENCODERS = 14;

export const SOFTWARE_WORKERS = 8;

interface EncoderLimits {
  readonly max: number;
  readonly workers: number;
}

export const encoderLimits = (encoder: Encoder, cores: number): EncoderLimits =>
  Encoder.match(encoder, {
    Hardware: () => ({ max: MAX_HARDWARE_ENCODERS, workers: HARDWARE_WORKERS }),
    Software: () => ({
      max: cores,
      workers: Math.max(1, Math.min(SOFTWARE_WORKERS, Math.floor(cores / 2))),
    }),
  });

export const videoWorkers = (
  workers: Option.Option<number>,
  encoder: Encoder,
  cores: number,
): number => Option.getOrElse(workers, () => encoderLimits(encoder, cores).workers);

export const videoEncoders = (
  workers: number,
  copies: Copies,
  encoder: Encoder,
  cores: number,
): Result.Result<number, TooManyEncoders> => {
  const { max } = encoderLimits(encoder, cores);
  const inPage = copiesInPage(copies, encoder);
  const both = hasMaster(inPage) && hasShare(inPage);
  return Result.liftPredicate(
    workers * (1 + Number(both)),
    (n) => n <= max,
    () => TooManyEncoders.make({ workers, share: both, max, encoder: encoderName(encoder) }),
  );
};

interface FrameSpan {
  readonly start: number;
  readonly end: number;
}

export const frameSpan = (
  info: ExportInfo,
  from: Option.Option<number>,
  to: Option.Option<number>,
): FrameSpan => ({
  start: Math.max(
    0,
    frameAtOrAfter(
      Option.getOrElse(from, () => 0),
      info.fps,
    ),
  ),
  end: Math.min(
    info.frames,
    frameAtOrAfter(
      Option.getOrElse(to, () => info.duration),
      info.fps,
    ),
  ),
});

export interface Chunk {
  readonly index: number;
  readonly from: number;
  readonly to: number;
}

const CHUNKS_PER_WORKER = 4;
export const MIN_CHUNK_FRAMES = 30;
export const MAX_CHUNK_FRAMES = 240;

const evenly = (frames: number, size: number): ReadonlyArray<number> => {
  const n = Math.max(1, Math.min(Math.ceil(frames / size), Math.floor(frames / MIN_CHUNK_FRAMES)));
  return Arr.makeBy(n, (k) => Math.floor(((k + 1) * frames) / n) - Math.floor((k * frames) / n));
};

const tailSizes = (size: number, pages: number): ReadonlyArray<number> =>
  Arr.unfold(Math.floor(size / 2), (n) =>
    Option.map(
      Option.liftPredicate(n, (k) => k >= MIN_CHUNK_FRAMES),
      (k): readonly [ReadonlyArray<number>, number] => [
        Arr.makeBy(pages, () => k),
        Math.floor(k / 2),
      ],
    ),
  ).flat();

const chunkSizes = (frames: number, size: number, pages: number): ReadonlyArray<number> => {
  const tail = tailSizes(size, pages);
  const head = frames - tail.reduce((sum, n) => sum + n, 0);
  if (head < MIN_CHUNK_FRAMES) return evenly(frames, size);
  return [...evenly(head, size), ...tail];
};

const planChunks = (start: number, end: number, workers: number): ReadonlyArray<Chunk> => {
  const frames = end - start;
  if (frames <= 0) return [];
  const pages = Math.max(1, workers);
  const size = Math.min(
    MAX_CHUNK_FRAMES,
    Math.max(MIN_CHUNK_FRAMES, Math.ceil(frames / (pages * CHUNKS_PER_WORKER))),
  );
  const sizes = chunkSizes(frames, size, pages);
  const ends = Arr.scan(sizes, start, (at, n) => at + n);
  return Arr.makeBy(sizes.length, (index) => ({
    index,
    from: ends[index] ?? start,
    to: ends[index + 1] ?? end,
  }));
};

export interface SegmentChunk extends Chunk {
  readonly segment: number;
}

export const segmentChunks = (
  segments: ReadonlyArray<{ readonly from: number; readonly to: number }>,
  workers: number,
): ReadonlyArray<SegmentChunk> => {
  const lengths = segments.map((s) => s.to - s.from);
  const total = lengths.reduce((sum, n) => sum + n, 0);
  const starts = Arr.scan(lengths, 0, (at, n) => at + n);
  const pieces = planChunks(0, total, workers).flatMap((chunk) =>
    segments.flatMap((segment, k) => {
      const base = starts[k] ?? 0;
      const from = Math.max(chunk.from, base);
      const to = Math.min(chunk.to, base + segment.to - segment.from);
      return Arr.filter(
        [{ segment: k, from: segment.from + from - base, to: segment.from + to - base }],
        () => to > from,
      );
    }),
  );
  return pieces.map((piece, index) => ({ ...piece, index }));
};

export const frameAt = (info: ExportInfo, t: number): number =>
  Math.max(0, Math.min(info.frames - 1, Math.round(t * info.fps)));

export const stillName = (t: number): string => `t${t.toFixed(2).padStart(7, '0')}.png`;

export const contactTimes = (from: number, to: number, every: number): ReadonlyArray<number> =>
  Arr.unfold(from, (t) =>
    Option.map(
      Option.liftPredicate(t, (x) => x < to && every > 0),
      (x): readonly [number, number] => [x, x + every],
    ),
  );

const pad = (n: number, width: number) => String(n).padStart(width, '0');

export const segmentName = (chunk: Chunk): string => `${pad(chunk.index, 3)}.mp4`;

export const shareName = (video: string): string => `${video.replace(/\.[^./]+$/, '')}.share.mp4`;

export const contactSheetName = 'contact.jpg';

export const lookbookName = 'lookbook.jpg';

export interface AudioCut {
  readonly file: string;
  readonly pieces: ReadonlyArray<FilmPiece>;
}

export const JOIN_FADE = 0.01;
