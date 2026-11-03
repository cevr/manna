import { Array as Arr, Effect, FileSystem, Option, Path, Schema } from 'effect';
import {
  CUTOUT_MARGIN,
  type CastModule,
  type CutoutEase,
  easePage,
  isCastModule,
  easeScene,
} from '../canvas/cast.ts';
import { FilmFolder, type FilmName, importFilmModule } from './film-repo.ts';
import { reserveNumbered } from './numbered-folder.ts';
import { Pages } from './pages.ts';

type Pt = readonly [number, number];

const jsonOf = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));

class EaseRefused extends Schema.TaggedError<EaseRefused>()('EaseRefused', {
  member: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `${this.member}'s ease: ${this.reason}`;
  }
}

interface EaseAsk {
  readonly from: string;
  readonly to: string;
  readonly seconds: number;
  readonly segments: ReadonlyArray<readonly [number, number]>;
  readonly shuffle: Option.Option<number>;
}

interface EaseFrameJson {
  readonly key: string;
  readonly theta: number;
  readonly held: string;
  readonly hand: Pt;
}

const shuffled = (count: number, seed: number) => {
  const order = Arr.makeBy(count, (i) => i);
  let s = seed >>> 0;
  for (let i = count - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = Math.floor((s / 4294967296) * (i + 1));
    const [a, b] = [order[i] ?? 0, order[j] ?? 0];
    order[i] = b;
    order[j] = a;
  }
  return order;
};

const onFrame = (m: CastModule, member: string, ease: CutoutEase) => {
  const view = m.CUTOUT?.[member]?.[ease.kind]?.[ease.view];
  return Option.map(Option.fromUndefinedOr(view), (v) => {
    const [ox, oy] = ease.puppet.origin;
    const origin: Pt = [CUTOUT_MARGIN[0] + v.at[0] - ox, CUTOUT_MARGIN[1] + v.at[1] - oy];
    return { origin, at: (p: Pt): Pt => [origin[0] + p[0], origin[1] + p[1]] };
  });
};

export const renderEase = Effect.fn('Cast.ease')(function* (
  film: FilmName,
  member: string,
  ask: EaseAsk,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const refuse = (reason: string) => EaseRefused.make({ member, reason });
  const paths = (yield* FilmFolder).paths(film);
  const file = path.join(paths.dir, 'rigs', 'cast.ts');
  const loaded: unknown = yield* Effect.tryPromise({
    try: () => importFilmModule(file),
    catch: (e) => refuse(`${file} does not load: ${String(e)}`),
  });
  if (!isCastModule(loaded)) return yield* refuse(`${file} exports no cast table`);
  const ease = yield* Effect.fromOption(
    Arr.findFirst(
      Object.values(loaded.EASES?.[member] ?? {}),
      (e) => e.from === ask.from && e.to === ask.to,
    ),
  ).pipe(Effect.mapError(() => refuse(`no ease from ${ask.from} to ${ask.to} (EASES)`)));
  if (Math.round(ask.seconds * ease.fps) !== ease.count)
    return yield* refuse(`${ask.seconds} s at ${ease.fps} fps is not its ${ease.count} frames`);
  const placed = yield* Effect.fromOption(onFrame(loaded, member, ease)).pipe(
    Effect.mapError(() => refuse(`CUTOUT has no ${ease.kind} ${ease.view}`)),
  );
  const segments = Arr.match(ask.segments, {
    onEmpty: () => [[0, ease.count - 1] as const],
    onNonEmpty: (s) => s,
  });
  const covered = segments.flatMap(([a, b]) => Arr.range(a, b));
  if (
    covered.length !== ease.count ||
    Arr.dedupe(covered).length !== ease.count ||
    covered.some((f) => f < 0 || f >= ease.count)
  )
    return yield* refuse(
      `the segments ${segments.map(([a, b]) => `${a}-${b}`).join(', ')} do not cover frames 0-${ease.count - 1} once each`,
    );
  const order = Option.match(ask.shuffle, {
    onNone: () => covered,
    onSome: (seed) => shuffled(ease.count, seed),
  });
  if (Option.isSome(ask.shuffle) && segments.length > 1)
    return yield* refuse('a shuffled order is drawn in one page: give no segments');
  const root = path.join(paths.out, 'cast', member, 'ease');
  const { n, dir } = yield* reserveNumbered(root);
  const name = (f: number) => `f${String(f).padStart(3, '0')}.png`;
  const runs = Option.match(ask.shuffle, {
    onNone: () => segments.map(([a, b]) => Arr.range(a, b)),
    onSome: () => [order],
  });
  for (const frames of runs)
    yield* Effect.scoped(
      Effect.gen(function* () {
        const pool = yield* (yield* Pages).open(easePage(film, member), {
          workers: 1,
          captions: false,
          server: Option.none(),
        });
        const scenes = yield* pool.call('scenes');
        const scene = yield* Effect.fromOption(
          Arr.findFirst(scenes, (s) => s.id === easeScene(ease.from, ease.to)),
        ).pipe(Effect.mapError(() => refuse('its page draws no scene of it')));
        const start = Math.round(scene.start * pool.info.fps);
        for (const f of frames)
          yield* fs.writeFile(
            path.join(dir, name(f)),
            yield* pool.call('frame', start + f, 'image/png'),
          );
      }),
    );
  const frames = Arr.makeBy(ease.count, (i): EaseFrameJson => {
    const at = ease.frame(i);
    const hand = Option.match(Option.fromUndefinedOr(at.look.held), {
      onNone: () => placed.origin,
      onSome: (h) => placed.at(h.at),
    });
    return { key: at.key, theta: at.theta, held: at.held, hand };
  });
  const record = {
    from: ease.from,
    to: ease.to,
    fps: ease.fps,
    count: ease.count,
    view: ease.view,
    origin: placed.origin,
    segments,
    ...(Option.isSome(ask.shuffle) && { order }),
    frames,
  };
  yield* fs.writeFileString(path.join(dir, 'ease.json'), `${jsonOf(record)}\n`);
  return { n, dir, record };
});
