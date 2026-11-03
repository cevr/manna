import { Array as Arr, Match, Option, Order, Result, Schema } from 'effect';
import { MAIN_VARIANT, RenderVariantName } from './catalogue.ts';
import type { Placed } from './layout.ts';
import { framesOf, secondsAt } from './time.ts';

export const SceneTimes = Schema.Struct({
  id: Schema.String,
  start: Schema.Finite,
  dur: Schema.Finite,
  marks: Schema.Record(Schema.String, Schema.Finite),
  cues: Schema.Record(Schema.String, Schema.Struct({ start: Schema.Finite, end: Schema.Finite })),
});
export type SceneTimes = typeof SceneTimes.Type;

export const sceneTimesOf = (p: Placed): SceneTimes => ({
  id: p.spec.id,
  start: p.start,
  dur: p.dur,
  marks: Object.fromEntries([...p.voice.marks].map(([name, at]) => [name, p.speechStart + at])),
  cues: Object.fromEntries([...p.cues].map(([name, c]) => [name, { start: c.start, end: c.end }])),
});

export class LookInvalid extends Schema.TaggedError<LookInvalid>()('LookInvalid', {
  reason: Schema.String,
}) {
  override get message() {
    return `look: ${this.reason}`;
  }
}

export class LookPlaceUnknown extends Schema.TaggedError<LookPlaceUnknown>()('LookPlaceUnknown', {
  scene: Schema.String,
  kind: Schema.Literals(['mark', 'cue']),
  place: Schema.String,
  known: Schema.Array(Schema.String),
}) {
  override get message() {
    return `scene ${this.scene} has no ${this.kind} "${this.place}" (its ${this.kind}s: ${this.known.join(', ') || 'none'})`;
  }
}

export class LookOutOfRange extends Schema.TaggedError<LookOutOfRange>()('LookOutOfRange', {
  scene: Schema.String,
  seconds: Schema.Finite,
  dur: Schema.Finite,
}) {
  override get message() {
    return `${this.seconds} s is past the end of scene ${this.scene} (it lasts ${this.dur.toFixed(2)} s)`;
  }
}

export class PagesBroken extends Schema.TaggedError<PagesBroken>()('PagesBroken', {
  reason: Schema.String,
}) {
  override get message() {
    return `the lab's pages do not build:\n${this.reason}`;
  }
}

export class LookFailed extends Schema.TaggedError<LookFailed>()('LookFailed', {
  reason: Schema.String,
}) {
  override get message() {
    return `the look failed: ${this.reason}`;
  }
}

export class LabElsewhere extends Schema.TaggedError<LabElsewhere>()('LabElsewhere', {
  lab: Schema.String,
  here: Schema.String,
}) {
  override get message() {
    return `this lab serves ${this.lab}, not ${this.here}: start a lab from this checkout (LAB_PORT=<port> bun run lab) and point FILM_LAB_URL at it`;
  }
}

export class LabDown extends Schema.TaggedError<LabDown>()('LabDown', {
  url: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `no lab answered a look at ${this.url} (${this.reason}): start one (bun run lab, or LAB_PORT=<port> bun cli.ts lab) and point FILM_LAB_URL at it`;
  }
}

export class ToolFailed extends Schema.TaggedError<ToolFailed>()('ToolFailed', {
  failed: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `${this.failed}: ${this.reason}`;
  }
}

export class LookLevelUnknown extends Schema.TaggedError<LookLevelUnknown>()('LookLevelUnknown', {
  look: Schema.String,
  level: Schema.String,
  missing: Schema.Literals(['look', 'level']),
  known: Schema.Array(Schema.String),
}) {
  override get message() {
    if (this.missing === 'look')
      return `the film has no look "${this.look}" (its looks: ${this.known.join(', ') || 'none'})`;
    return `look ${this.look} has no level "${this.level}" (its levels: ${this.known.join(', ')})`;
  }
}

export type PlaceError = LookInvalid | LookPlaceUnknown | LookOutOfRange;

type LookAt =
  | { readonly _tag: 'Seconds'; readonly seconds: number }
  | { readonly _tag: 'Mark'; readonly mark: string }
  | { readonly _tag: 'Cue'; readonly cue: string; readonly share: number };

const SECONDS = /^\d+(?:\.\d+)?$/;

const invalid = (reason: string) => Result.fail(LookInvalid.make({ reason }));

export const lookAtOf = (text: string): Result.Result<LookAt, LookInvalid> => {
  if (SECONDS.test(text)) return Result.succeed({ _tag: 'Seconds', seconds: Number(text) });
  if (text.startsWith('mark:') && text.length > 5)
    return Result.succeed({ _tag: 'Mark', mark: text.slice(5) });
  if (!text.startsWith('cue:') || text.length <= 4)
    return invalid(
      `"${text}" is no place in a scene: seconds into it, mark:<name> or cue:<name>[@<0..1>]`,
    );
  const [cue = '', ...shares] = text.slice(4).split('@');
  if (cue === '' || shares.length > 1) return invalid(`"${text}" names no cue`);
  return Option.match(Arr.head(shares), {
    onNone: () => Result.succeed<LookAt>({ _tag: 'Cue', cue, share: 0 }),
    onSome: (share) => {
      const n = Number(share);
      if (share === '' || !Number.isFinite(n) || n < 0 || n > 1)
        return invalid(`"${text}": a cue's share is a number from 0 (its start) to 1 (its end)`);
      return Result.succeed<LookAt>({ _tag: 'Cue', cue, share: n });
    },
  });
};

interface Moment {
  readonly at: string;
  readonly frame: number;
  readonly time: number;
}

const secondOf = (
  scene: SceneTimes,
  at: LookAt,
): Result.Result<number, LookPlaceUnknown | LookOutOfRange> =>
  Match.valueTags(at, {
    Seconds: ({ seconds }) => {
      if (seconds > scene.dur)
        return Result.fail(LookOutOfRange.make({ scene: scene.id, seconds, dur: scene.dur }));
      return Result.succeed(seconds);
    },
    Mark: ({ mark }) =>
      Result.fromOption(Option.fromUndefinedOr(scene.marks[mark]), () =>
        LookPlaceUnknown.make({
          scene: scene.id,
          kind: 'mark',
          place: mark,
          known: Object.keys(scene.marks),
        }),
      ),
    Cue: ({ cue, share }) =>
      Result.fromOption(
        Option.map(
          Option.fromUndefinedOr(scene.cues[cue]),
          (c) => c.start + share * (c.end - c.start),
        ),
        () =>
          LookPlaceUnknown.make({
            scene: scene.id,
            kind: 'cue',
            place: cue,
            known: Object.keys(scene.cues),
          }),
      ),
  });

export const momentOf = (
  scene: SceneTimes,
  fps: number,
  text: string,
): Result.Result<Moment, PlaceError> =>
  Result.flatMap(lookAtOf(text), (at) =>
    Result.map(secondOf(scene, at), (second) => {
      const held = framesOf({ from: scene.start, to: scene.start + scene.dur }, fps);
      const [first, last] = [held.first, Math.max(held.first, held.last)];
      const frame = Math.min(last, Math.max(first, Math.round((scene.start + second) * fps)));
      return { at: text, frame, time: secondsAt(frame, fps) - scene.start };
    }),
  );

export const LookMode = Schema.Literals(['plain', 'value', 'squint']);
export type LookMode = typeof LookMode.Type;

export const formatFor = (cropped: boolean): StillView['format'] => {
  if (cropped) return 'image/png';
  return 'image/jpeg';
};

const Crop = Schema.Tuple([Schema.Finite, Schema.Finite, Schema.Finite, Schema.Finite]);
type Crop = typeof Crop.Type;

export const levelsOf = (
  flags: ReadonlyArray<string>,
): Result.Result<Readonly<Record<string, string>>, LookInvalid> =>
  Result.flatMap(
    Result.all(
      flags.map((flag) => {
        const [look = '', level = '', ...rest] = flag.split('=');
        if (look === '' || level === '' || rest.length > 0)
          return invalid(`--level ${flag}: a look and its level, look=level`);
        return Result.succeed([look, level] as const);
      }),
    ),
    (pairs) => {
      const looks = pairs.map(([look]) => look);
      return Option.match(
        Arr.findFirst(looks, (look, i) => looks.indexOf(look) !== i),
        {
          onNone: () => Result.succeed(Object.fromEntries(pairs)),
          onSome: (twice) => invalid(`--level ${twice} is given twice: one level a look`),
        },
      );
    },
  );

export const wedgeVariant = (
  variant: Option.Option<RenderVariantName>,
  levels: Readonly<Record<string, string>>,
): Result.Result<RenderVariantName, LookInvalid> => {
  const pairs = Arr.sortWith(Object.entries(levels), ([look]) => look, Order.String);
  if (pairs.length > 0 && Option.contains(variant, MAIN_VARIANT))
    return invalid('a wedge is never main: name it otherwise with --variant, or drop --variant');
  if (Option.isSome(variant)) return Result.succeed(variant.value);
  if (pairs.length === 0) return Result.succeed(MAIN_VARIANT);
  const named = pairs.map(([look, level]) => `${look}-${level}`).join('-');
  if (Schema.is(RenderVariantName)(named)) return Result.succeed(named);
  return invalid(
    `--level ${named} makes no variant's name (lower case, digits, . _ -): name it with --variant`,
  );
};

const LOOK_MAX_SIZE = 4096;

export const StillView = Schema.Struct({
  crop: Schema.optionalKey(Crop),
  size: Schema.optionalKey(
    Schema.Int.check(Schema.isBetween({ minimum: 16, maximum: LOOK_MAX_SIZE })),
  ),
  mode: LookMode,
  captions: Schema.Boolean,
  format: Schema.Literals(['image/png', 'image/jpeg']),
});
export type StillView = typeof StillView.Type;

interface ViewBox {
  readonly sx: number;
  readonly sy: number;
  readonly sw: number;
  readonly sh: number;
  readonly dw: number;
  readonly dh: number;
  readonly grey: boolean;
  readonly blur: number;
}

const SQUINT = 0.012;

export const viewBox = (
  view: StillView,
  width: number,
  height: number,
): Result.Result<ViewBox, LookInvalid> => {
  const [x0, y0, x1, y1] = Option.getOrElse(Option.fromUndefinedOr(view.crop), (): Crop => [
    0,
    0,
    width,
    height,
  ]);
  const sx = Math.max(0, Math.round(Math.min(x0, x1)));
  const sy = Math.max(0, Math.round(Math.min(y0, y1)));
  const ex = Math.min(width, Math.round(Math.max(x0, x1)));
  const ey = Math.min(height, Math.round(Math.max(y0, y1)));
  if (ex - sx < 1 || ey - sy < 1)
    return invalid(
      `the crop ${[x0, y0, x1, y1].join(',')} holds none of the ${width}×${height} frame`,
    );
  const sw = ex - sx;
  const sh = ey - sy;
  const scale = Option.match(Option.fromUndefinedOr(view.size), {
    onNone: () => 1,
    onSome: (size) => size / Math.max(sw, sh),
  });
  const dw = Math.max(1, Math.round(sw * scale));
  const dh = Math.max(1, Math.round(sh * scale));
  const squint = Math.round(Math.max(2, SQUINT * Math.max(dw, dh)) * 10) / 10;
  const { grey, blur } = {
    plain: { grey: false, blur: 0 },
    value: { grey: true, blur: 0 },
    squint: { grey: true, blur: squint },
  }[view.mode];
  return Result.succeed({ sx, sy, sw, sh, dw, dh, grey, blur });
};

export const LookPost = Schema.Struct({
  scene: Schema.String,
  at: Schema.NonEmptyArray(Schema.String),
  view: StillView,
  from: Schema.optionalKey(Schema.String),
  levels: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
});
export type LookPost = typeof LookPost.Type;

export const wedgeName = (levels: Readonly<Record<string, string>>): string =>
  Object.entries(levels)
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(([look, level]) => `${look}-${level}`)
    .join('.');

export const Look = Schema.Struct({
  file: Schema.String,
  scene: Schema.String,
  at: Schema.String,
  frame: Schema.Int,
  time: Schema.Finite,
  width: Schema.Int,
  height: Schema.Int,
});
export type Look = typeof Look.Type;

export const LookTaken = Schema.Struct({
  build: Schema.String,
  looks: Schema.Array(Look),
});
export type LookTaken = typeof LookTaken.Type;

const EXTENSION: Readonly<Record<StillView['format'], string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
};

export const lookFileName = (
  moment: Moment,
  view: StillView,
  build: string,
  wedge: string = '',
): string => {
  const parts = [
    `t${moment.time.toFixed(2).padStart(7, '0')}`,
    ...Arr.filter([view.mode], (mode) => mode !== 'plain'),
    ...Option.toArray(Option.map(Option.fromUndefinedOr(view.crop), (c) => `crop${c.join('_')}`)),
    ...Option.toArray(Option.map(Option.fromUndefinedOr(view.size), (s) => `s${s}`)),
    ...Arr.filter(['captions'], () => view.captions),
    ...Arr.filter([`w${wedge}`], () => wedge !== ''),
    `b${build}`,
  ];
  return `${parts.join('.')}.${EXTENSION[view.format]}`;
};

export const lookLine = (look: Look, build: string): string =>
  `${look.file} scene=${look.scene} at=${look.at} t=${look.time.toFixed(2)} frame=${look.frame} size=${look.width}x${look.height} build=${build}`;
