import {
  Array as Arr,
  Clock,
  DateTime,
  Effect,
  FileSystem,
  Option,
  Path,
  Random,
  Result,
  Schema,
} from 'effect';
import { type Address, addressKey, sceneAddress } from '../core/address.ts';
import { membersOf } from '../core/acts.ts';
import { type Catalogue, approvalState, subjectOf } from '../core/catalogue.ts';
import { type LookPost, type LookTaken, type SceneTimes, sceneTimesOf } from '../core/easel.ts';
import { UnknownScene } from '../core/errors.ts';
import {
  CounselUnreadable,
  JUDGE_SIZE,
  JudgeKeyJson,
  type JudgeKey,
  type JudgeMoment,
  JudgeNothingToCompare,
  JudgePointAmbiguous,
  JudgePointUnjudged,
  type JudgeRule,
  JudgeRuleMissing,
  LABELS,
  type QuotedRule,
  type Ranking,
  judgeMoments,
  packetOf,
  rankingOf,
  registersOf,
  rulesFor,
  sectionOf,
  verdictOf,
} from '../core/judge.ts';
import { PointId, type PointRef, pointIdOf } from '../core/point.ts';
import type { MediaFailed } from '../core/refusals.ts';
import type { Looks } from '../core/schema.ts';
import type { PlatformError } from 'effect/PlatformError';
import { RenderCatalogue } from './catalogue.ts';
import { Counsel } from './counsel.ts';
import { FilmRepo, type FilmName, placeFilm } from './film-repo.ts';
import { Media } from './media.ts';

interface Version<E, R> {
  readonly name: string;
  readonly picked: boolean;
  readonly detail: string;
  readonly draw: (
    moments: Arr.NonEmptyReadonlyArray<JudgeMoment>,
    files: ReadonlyArray<string>,
  ) => Effect.Effect<void, E, R>;
}

interface Choice<E, R> {
  readonly point: string;
  readonly title: string;
  readonly versions: ReadonlyArray<Version<E, R>>;
}

interface JudgeAsk<TE, TR> {
  readonly film: FilmName;
  readonly scene: string;
  readonly point: Option.Option<string>;
  readonly captions: boolean;
  readonly rules: ReadonlyArray<JudgeRule>;
  readonly take: (post: LookPost) => Effect.Effect<LookTaken, TE, TR>;
}

interface Judged {
  readonly dir: string;
  readonly verdict: string;
  readonly packet: string;
  readonly counsel: string;
  readonly key: JudgeKey;
  readonly ranking: Ranking;
}

const stampOf = (now: DateTime.Utc) =>
  DateTime.formatIso(now)
    .replace(/\.\d+Z$/, 'Z')
    .replace(/[-:]/g, '');

const FOLDER_TRIES = 8;

const isAlreadyExists = (error: PlatformError) => error.reason._tag === 'AlreadyExists';

const runFolder = Effect.fnUntraced(function* (under: string, scene: string, now: DateTime.Utc) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  yield* fs.makeDirectory(under, { recursive: true });
  return yield* Effect.gen(function* () {
    const draw = (yield* Random.nextIntBetween(0, 36 ** 4)).toString(36).padStart(4, '0');
    const dir = path.join(under, `${scene}-${stampOf(now)}-${draw}`);
    yield* fs.makeDirectory(dir);
    return dir;
  }).pipe(Effect.retry({ while: isAlreadyExists, times: FOLDER_TRIES }));
});

const encodeKey = Schema.encodeSync(JudgeKeyJson);

const stillName = (label: string, i: number) => `${label}-${String(i + 1).padStart(2, '0')}.jpg`;

const videosAt = (catalogue: Catalogue, address: Address) =>
  catalogue.renders
    .filter((r) => r.kind === 'video' && addressKey(r.address) === addressKey(address))
    .toSorted(
      (a, b) =>
        Number(b.variant === 'main') - Number(a.variant === 'main') ||
        a.variant.localeCompare(b.variant),
    );

const decodePoint = Schema.decodeUnknownOption(PointId);

export const judge = Effect.fn('judge')(function* <TE, TR>(ask: JudgeAsk<TE, TR>) {
  const started = yield* Clock.currentTimeMillis;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const repo = yield* FilmRepo;
  const media = yield* Media;
  const counsel = yield* Counsel;
  const loaded = yield* repo.load(ask.film);
  const placed = yield* placeFilm(loaded);
  const scene: SceneTimes = yield* Effect.fromOption(
    Option.map(
      Arr.findFirst(placed, (p) => p.spec.id === ask.scene),
      sceneTimesOf,
    ),
  ).pipe(
    Effect.mapError(() =>
      UnknownScene.make({ scene: ask.scene, known: placed.map((p) => p.spec.id) }),
    ),
  );
  const catalogue = yield* (yield* RenderCatalogue).read(loaded.paths);
  const view = {
    mode: 'plain',
    captions: ask.captions,
    format: 'image/jpeg',
    size: JUDGE_SIZE,
  } as const;

  const lookChoice = (name: string, look: Looks[string]): Choice<TE | PlatformError, TR> => ({
    point: pointIdOf({ _tag: 'Look', name }),
    title: `look \`${name}\` (its level)`,
    versions: Object.entries(look.options).map(([level, value]) => ({
      name: level,
      picked: level === look.play,
      detail: `look ${name} at ${level} (${value})`,
      draw: (moments, files) =>
        Effect.gen(function* () {
          const taken = yield* ask.take({
            scene: scene.id,
            at: Arr.map(moments, (m) => m.at),
            view,
            levels: { [name]: level },
          });
          yield* Effect.forEach(Arr.zip(taken.looks, files), ([one, file]) =>
            fs.copyFile(one.file, file),
          );
        }),
    })),
  });

  const renderChoice = (address: Address): Choice<JudgePointUnjudged | MediaFailed, never> => {
    const point = pointIdOf({ _tag: 'Render', address });
    return {
      point,
      title: 'which render of the scene (its variant)',
      versions: videosAt(catalogue, address).map((render) => {
        const from = Option.match(render.span, { onNone: () => 0, onSome: (s) => s.from });
        const to = Option.match(render.span, {
          onNone: () => Number.POSITIVE_INFINITY,
          onSome: (s) => s.to,
        });
        const clip = Option.orElse(render.files.clip, () => render.files.share);
        return {
          name: render.variant,
          picked: approvalState(catalogue, subjectOf(render)) === 'approved',
          detail: `render ${render.variant}, stamp ${render.stamp.key.slice(0, 12)}`,
          draw: (moments, files) =>
            Effect.gen(function* () {
              const video = yield* Effect.fromOption(clip).pipe(
                Effect.mapError(() =>
                  JudgePointUnjudged.make({
                    point,
                    reason: `render ${render.variant} has no video`,
                  }),
                ),
              );
              yield* Effect.forEach(
                Arr.zip(moments, files),
                ([m, file]): Effect.Effect<void, JudgePointUnjudged | MediaFailed> => {
                  const at = scene.start + m.second;
                  if (at < from || at > to)
                    return Effect.fail(
                      JudgePointUnjudged.make({
                        point,
                        reason: `render ${render.variant} covers ${from.toFixed(2)}–${to.toFixed(2)} s, not ${m.at} at ${at.toFixed(2)} s`,
                      }),
                    );
                  return media.still(
                    path.join(loaded.paths.out, video),
                    at - from,
                    JUDGE_SIZE,
                    file,
                  );
                },
              );
            }),
        };
      }),
    };
  };

  type AnyChoice = Choice<TE | PlatformError | JudgePointUnjudged | MediaFailed, TR>;

  const choiceOf = (id: string, ref: PointRef): Result.Result<AnyChoice, JudgePointUnjudged> => {
    if (ref._tag === 'Look')
      return Option.match(Option.fromUndefinedOr(loaded.looks[ref.name]), {
        onNone: () =>
          Result.fail(
            JudgePointUnjudged.make({
              point: id,
              reason: `the film has no look ${ref.name} (its looks: ${Object.keys(loaded.looks).join(', ') || 'none'})`,
            }),
          ),
        onSome: (look) => Result.succeed<AnyChoice>(lookChoice(ref.name, look)),
      });
    if (ref._tag === 'Render') return Result.succeed<AnyChoice>(renderChoice(ref.address));
    return Result.fail(
      JudgePointUnjudged.make({
        point: id,
        reason: `a ${ref._tag.toLowerCase()} is heard, not seen: the judge compares pictures (a look's levels, a render set's variants)`,
      }),
    );
  };

  const own: ReadonlyArray<AnyChoice> = [
    ...Object.entries(loaded.looks).map(([name, look]) => lookChoice(name, look)),
    renderChoice(sceneAddress(scene.id)),
  ];
  const choice = yield* Option.match(ask.point, {
    onSome: (id) =>
      Option.match(decodePoint(id), {
        onNone: () =>
          Effect.fail(
            JudgePointUnjudged.make({ point: id, reason: 'no choice point is called that' }),
          ),
        onSome: (ref) => Effect.fromResult(choiceOf(id, ref)),
      }),
    onNone: () => {
      const open = own.filter((c) => c.versions.length >= 2);
      return Arr.match(open, {
        onEmpty: () =>
          Effect.fail(
            JudgeNothingToCompare.make({
              scene: scene.id,
              reason: `no picture choice here has two versions (${own.map((c) => `${c.point}: ${c.versions.length}`).join(', ')})`,
            }),
          ),
        onNonEmpty: (found) => {
          if (found.length > 1)
            return Effect.fail(
              JudgePointAmbiguous.make({ scene: scene.id, points: found.map((c) => c.point) }),
            );
          return Effect.succeed(Arr.headNonEmpty(found));
        },
      });
    },
  });
  if (choice.versions.length < 2)
    return yield* JudgeNothingToCompare.make({
      scene: scene.id,
      reason: `${choice.point} has ${choice.versions.length} version${Arr.filter(['s'], () => choice.versions.length !== 1).join('')} here`,
    });
  if (choice.versions.length > LABELS.length)
    return yield* JudgePointUnjudged.make({
      point: choice.point,
      reason: `${choice.versions.length} versions, more than the ${LABELS.length} a judge shows`,
    });

  const beat = Option.flatMap(yield* repo.script(ask.film), (beats) =>
    Arr.findFirst(beats, (b) => b.id === scene.id),
  );
  const timed = Arr.findFirst(loaded.scenes, (s) => s.id === scene.id);
  const say = Option.getOrElse(
    Option.orElse(
      Option.flatMap(beat, (b) => Option.fromUndefinedOr(b.say)),
      () => Option.flatMap(timed, (t) => Option.fromUndefinedOr(t.say)),
    ),
    () => '',
  );
  const picture = Option.getOrElse(
    Option.flatMap(beat, (b) => Option.fromUndefinedOr(b.picture)),
    () => '(no brief written)',
  );
  const registers = registersOf(picture);
  const act = Option.flatMap(loaded.look, (look) =>
    Option.flatMap(
      Result.getSuccess(
        membersOf(
          look.acts,
          loaded.scenes.map((s) => s.id),
        ),
      ),
      (members) =>
        Option.map(
          Arr.findFirst(members, (m) => m.scenes.includes(scene.id)),
          (m) => m.part.name,
        ),
    ),
  );

  const texts = new Map<string, string>();
  const rules: ReadonlyArray<QuotedRule> = yield* Effect.forEach(
    rulesFor(ask.rules, registers),
    (rule) =>
      Effect.gen(function* () {
        const text = yield* Option.match(Option.fromUndefinedOr(texts.get(rule.file)), {
          onSome: Effect.succeed,
          onNone: () =>
            Effect.tap(
              fs
                .readFileString(rule.file)
                .pipe(
                  Effect.mapError(() =>
                    JudgeRuleMissing.make({ file: rule.file, heading: rule.heading }),
                  ),
                ),
              (read) => Effect.sync(() => void texts.set(rule.file, read)),
            ),
        });
        const section = yield* Effect.fromOption(sectionOf(text, rule.heading)).pipe(
          Effect.mapError(() => JudgeRuleMissing.make({ file: rule.file, heading: rule.heading })),
        );
        return {
          file: path.basename(rule.file),
          heading: rule.heading,
          text: section,
        } satisfies QuotedRule;
      }),
  );

  const now = yield* DateTime.now;
  const moments = judgeMoments(scene, loaded.fps);
  const atLeastOne = yield* Effect.fromOption(
    Option.liftPredicate(moments, Arr.isReadonlyArrayNonEmpty),
  ).pipe(
    Effect.mapError(() =>
      JudgeNothingToCompare.make({ scene: scene.id, reason: 'the scene has no moment to show' }),
    ),
  );
  const order = yield* Random.shuffle(choice.versions);
  const labelled = order.map((version, i) => ({
    label: Option.getOrElse(Arr.get(LABELS, i), () => '?'),
    version,
  }));
  const key: JudgeKey = {
    film: ask.film,
    scene: scene.id,
    point: choice.point,
    at: DateTime.formatIso(now),
    versions: labelled.map(({ label, version }) => ({
      label,
      version: version.name,
      picked: version.picked,
      detail: version.detail,
    })),
  };

  return yield* Effect.scoped(
    Effect.gen(function* () {
      const blind = yield* fs.makeTempDirectoryScoped();
      const stills = path.join(blind, 'stills');
      yield* fs.makeDirectory(stills);
      const drawn = yield* Effect.forEach(labelled, ({ label, version }) =>
        Effect.gen(function* () {
          const files = moments.map((_, i) => path.join(stills, stillName(label, i)));
          yield* version.draw(atLeastOne, files);
          yield* Effect.log(`judge.drawn label=${label} stills=${files.length}`);
          return { label, files };
        }),
      );
      const asked = path.join(blind, 'packet.md');
      yield* fs.writeFileString(
        asked,
        packetOf({
          choice: choice.title,
          scene: scene.id,
          say,
          picture,
          registers,
          act,
          rules,
          moments,
          stills: drawn.map(({ label, files }) => ({
            label,
            files: files.map((file) => path.relative(blind, file)),
          })),
        }),
      );

      const dir = yield* runFolder(path.join(loaded.paths.out, 'judge'), scene.id, now);
      const answer = yield* counsel.ask(asked, path.join(dir, 'counsel'));
      const ranking = yield* Effect.fromResult(
        Result.mapError(
          rankingOf(
            answer.text,
            labelled.map((l) => l.label),
          ),
          (reason) => CounselUnreadable.make({ file: answer.file, reason }),
        ),
      );

      const moved = (text: string) => text.replaceAll(blind, dir);
      yield* fs.copy(stills, path.join(dir, 'stills'));
      const packet = path.join(dir, 'packet.md');
      yield* fs.copyFile(asked, packet);
      yield* fs.writeFileString(path.join(dir, 'key.json'), `${encodeKey(key)}\n`);
      const verdict = path.join(dir, 'verdict.md');
      yield* fs.writeFileString(
        verdict,
        verdictOf({ key, ranking, answer: moved(answer.text), counsel: answer.file, packet }),
      );
      const done = yield* Clock.currentTimeMillis;
      yield* Effect.log(
        `judge.done film=${ask.film} scene=${scene.id} point=${choice.point} versions=${labelled.length} stills=${moments.length} ranking=${ranking._tag} ms=${done - started}`,
      );
      return { dir, verdict, packet, counsel: answer.file, key, ranking } satisfies Judged;
    }),
  );
});
