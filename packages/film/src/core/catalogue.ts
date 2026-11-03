import { Array as Arr, Match, Option, Schema } from 'effect';
import { Address, addressKey, sceneAddress } from './address.ts';
import { ActName } from './address-schema.ts';
import type { Say } from './api.ts';
import { PointId, type PointRef, pointIdOf } from './point.ts';
import { maybe } from './schema.ts';
import { Segment } from './segment.ts';
import { FilmPiece } from './shorts.ts';

export const Stamp = Schema.Struct({
  commit: maybe(Schema.String),
  key: Schema.String,
});
export type Stamp = typeof Stamp.Type;

export const RenderVariantName = Segment.check(Schema.isPattern(/^[a-z0-9][a-z0-9._-]*$/));
export type RenderVariantName = typeof RenderVariantName.Type;

export const RenderKind = Schema.Literals(['video', 'stills', 'contact', 'lookbook']);
export type RenderKind = typeof RenderKind.Type;

const RenderSettings = Schema.Struct({
  scale: Schema.Finite,
  captions: Schema.Boolean,
});
type RenderSettings = typeof RenderSettings.Type;

const RenderFiles = Schema.Struct({
  clip: maybe(Schema.String),
  share: maybe(Schema.String),
  captions: maybe(Schema.String),
  chapters: maybe(Schema.String),
  description: maybe(Schema.String),
  images: Schema.Array(Schema.String),
});
type RenderFiles = typeof RenderFiles.Type;

export const RenderSound = Schema.Struct({
  mix: maybe(Schema.String),
  pieces: Schema.Array(FilmPiece),
});
export type RenderSound = typeof RenderSound.Type;

export const Render = Schema.Struct({
  address: Address,
  variant: RenderVariantName,
  kind: RenderKind,
  settings: RenderSettings,
  stamp: Stamp,
  span: maybe(Schema.Struct({ from: Schema.Finite, to: Schema.Finite })),
  files: RenderFiles,
  sound: maybe(RenderSound),
  at: Schema.Finite,
});
export type Render = typeof Render.Type;

const SayFields = {
  address: Address,
  point: maybe(PointId),
  variant: Schema.String,
  key: Schema.String,
};

export const OpId = Schema.String.check(Schema.isPattern(/^[0-9a-z]+(-[0-9a-z]+)*$/)).pipe(
  Schema.brand('OpId'),
);
export type OpId = typeof OpId.Type;

const Approval = Schema.Struct({ ...SayFields, at: Schema.Finite, op: maybe(OpId) });
type Approval = typeof Approval.Type;

const Comment = Schema.Struct({
  id: Schema.String,
  ...SayFields,
  text: Schema.String,
  at: Schema.Finite,
});
type Comment = typeof Comment.Type;

export const Catalogue = Schema.Struct({
  film: Schema.String,
  renders: Schema.Array(Render),
  approvals: Schema.Array(Approval),
  comments: Schema.Array(Comment),
});
export type Catalogue = typeof Catalogue.Type;

export const CatalogueJson = Schema.fromJsonString(Catalogue);

export const emptyCatalogue = (film: string): Catalogue => ({
  film,
  renders: [],
  approvals: [],
  comments: [],
});

export const MAIN_VARIANT = RenderVariantName.make('main');

interface Slot {
  readonly address: Address;
  readonly variant: string;
  readonly kind: RenderKind;
}

const sameSlot = (a: Slot, b: Slot) =>
  addressKey(a.address) === addressKey(b.address) && a.variant === b.variant && a.kind === b.kind;

export interface Topic {
  readonly address: Address;
  readonly point: Option.Option<PointRef>;
  readonly variant: string;
}

export interface Subject extends Topic {
  readonly key: string;
}

export const topicAt = (address: Address, ref: PointRef, variant: string): Topic => ({
  address,
  point: Option.liftPredicate(ref, (r) => r._tag !== 'Render'),
  variant,
});

const pointOf = (topic: Topic): PointRef =>
  Option.getOrElse(topic.point, (): PointRef => ({ _tag: 'Render', address: topic.address }));

const renderVersion = (render: Render): string =>
  Option.match(
    Option.flatMap(render.sound, (s) => s.mix),
    {
      onNone: () => render.stamp.key,
      onSome: (mix) => `${render.stamp.key}+${mix}`,
    },
  );

export const subjectOf = (render: Render): Subject => ({
  ...topicOf(render),
  key: renderVersion(render),
});

const topicOf = (slot: Pick<Slot, 'address' | 'variant'>): Topic =>
  topicAt(slot.address, { _tag: 'Render', address: slot.address }, slot.variant);

const about = (on: Topic, topic: Topic) =>
  pointIdOf(pointOf(on)) === pointIdOf(pointOf(topic)) && on.variant === topic.variant;

export const recordRender = (catalogue: Catalogue, render: Render): Catalogue => ({
  ...catalogue,
  renders: [...catalogue.renders.filter((r) => !sameSlot(r, render)), render],
});

export const renderIn = (catalogue: Catalogue, slot: Slot): Option.Option<Render> =>
  Arr.findFirst(catalogue.renders, (r) => sameSlot(r, slot));

export const VariantState = Schema.Literals(['current', 'stale', 'missing']);
export type VariantState = typeof VariantState.Type;

export const StaleBy = Schema.Literals(['sources', 'sound']);
export type StaleBy = typeof StaleBy.Type;

interface RenderNow {
  readonly key: string;
  readonly sound: Option.Option<string>;
}

interface Drawn {
  readonly key: string;
  readonly mix: Option.Option<string>;
}

const drawnStaleBy = (drawn: Drawn, now: RenderNow): Option.Option<StaleBy> => {
  if (drawn.key !== now.key) return Option.some('sources');
  const carried = Option.match(now.sound, {
    onNone: () => true,
    onSome: (mix) => Option.contains(drawn.mix, mix),
  });
  if (!carried) return Option.some('sound');
  return Option.none();
};

const drawnBy = (render: Render): Drawn => ({
  key: render.stamp.key,
  mix: Option.flatMap(render.sound, (s) => s.mix),
});

const staleBy = (render: Render, now: RenderNow): Option.Option<StaleBy> =>
  drawnStaleBy(drawnBy(render), now);

interface Judgement {
  readonly state: VariantState;
  readonly staleBy: Option.Option<StaleBy>;
}

const judgedBy = (why: Option.Option<StaleBy>): Judgement => ({
  state: Option.match(why, {
    onNone: (): VariantState => 'current',
    onSome: (): VariantState => 'stale',
  }),
  staleBy: why,
});

export const renderState = (render: Option.Option<Render>, now: RenderNow): Judgement =>
  Option.match(render, {
    onNone: (): Judgement => ({ state: 'missing', staleBy: Option.none() }),
    onSome: (r) => judgedBy(staleBy(r, now)),
  });

const newest = (renders: ReadonlyArray<Render>): Option.Option<Render> =>
  Arr.last(renders.toSorted((a, b) => a.at - b.at));

export const recordedNow = (catalogue: Catalogue, address: Address): Option.Option<RenderNow> => {
  const videos = catalogue.renders.filter((r) => r.kind === 'video');
  return Option.map(
    newest(videos.filter((r) => addressKey(r.address) === addressKey(address))),
    (latest): RenderNow => ({
      key: latest.stamp.key,
      sound: Option.flatMap(
        newest(videos.filter((r) => Option.isSome(Option.flatMap(r.sound, (s) => s.mix)))),
        (r) => Option.flatMap(r.sound, (s) => s.mix),
      ),
    }),
  );
};

type RenderNeed = 'current' | 'remux' | 'draw';

export const renderNeed = (
  catalogue: Catalogue,
  slot: Slot,
  now: RenderNow,
  settings: RenderSettings,
): RenderNeed =>
  Option.match(renderIn(catalogue, slot), {
    onNone: (): RenderNeed => 'draw',
    onSome: (r): RenderNeed => {
      const same = r.settings.scale === settings.scale && r.settings.captions === settings.captions;
      const why = staleBy(r, now);
      if (!same || Option.contains(why, 'sources')) return 'draw';
      if (Option.isNone(r.files.clip)) return 'draw';
      if (Option.isNone(why)) return 'current';
      if (Option.isSome(r.sound)) return 'remux';
      return 'draw';
    },
  });

export const ApprovalState = Schema.Literals(['none', 'approved', 'stale']);
export type ApprovalState = typeof ApprovalState.Type;

export const approvalState = (catalogue: Catalogue, subject: Subject): ApprovalState => {
  const given = catalogue.approvals.filter((a) => about(a, subject));
  if (given.some((a) => a.key === subject.key)) return 'approved';
  if (given.length > 0) return 'stale';
  return 'none';
};

export const approve = (
  catalogue: Catalogue,
  subject: Subject,
  at: number,
  op: Option.Option<OpId> = Option.none(),
): Catalogue => {
  if (approvalState(catalogue, subject) === 'approved') return catalogue;
  const { address, point, variant, key } = subject;
  return {
    ...catalogue,
    approvals: [...catalogue.approvals, { address, point, variant, key, at, op }],
  };
};

export const withdraw = (
  catalogue: Catalogue,
  topic: Topic,
  given: Option.Option<OpId> = Option.none(),
): Catalogue => ({
  ...catalogue,
  approvals: catalogue.approvals.filter(
    (a) =>
      !(
        about(a, topic) &&
        Option.match(given, { onNone: () => true, onSome: (op) => Option.contains(a.op, op) })
      ),
  ),
});

interface Withdrawn {
  readonly catalogue: Catalogue;
  readonly took: ReadonlyArray<string>;
}

export const withdrawScenes = (
  catalogue: Catalogue,
  scenes: ReadonlyArray<string>,
  variant: string,
  given: Option.Option<OpId>,
): Withdrawn =>
  scenes.reduce<Withdrawn>(
    (done, scene) => {
      const next = withdraw(done.catalogue, topicOf(sceneSlot(scene, variant)), given);
      return {
        catalogue: next,
        took: Arr.appendAll(
          done.took,
          Arr.filter([scene], () => next.approvals.length < done.catalogue.approvals.length),
        ),
      };
    },
    { catalogue, took: [] },
  );

export const said = (
  catalogue: Catalogue,
  subject: Subject,
  say: Say,
  at: number,
  op: Option.Option<OpId> = Option.none(),
): Catalogue =>
  Match.valueTags(say, {
    Approve: () => approve(catalogue, subject, at, op),
    Withdraw: ({ given }) => withdraw(catalogue, subject, given),
    Comment: ({ text }) => comment(catalogue, subject, text, at),
  });

export const nextCommentId = (catalogue: Catalogue): string => `c${catalogue.comments.length + 1}`;

export const comment = (
  catalogue: Catalogue,
  subject: Subject,
  text: string,
  at: number,
): Catalogue => {
  const { address, point, variant, key } = subject;
  return {
    ...catalogue,
    comments: [
      ...catalogue.comments,
      { id: nextCommentId(catalogue), address, point, variant, key, text, at },
    ],
  };
};

export const commentsOn = (catalogue: Catalogue, topic: Topic): ReadonlyArray<Comment> =>
  catalogue.comments.filter((c) => about(c, topic)).toSorted((a, b) => a.at - b.at);

export const SaidComment = Schema.Struct({
  ...Comment.fields,
  onThis: Schema.Boolean,
});
export type SaidComment = typeof SaidComment.Type;

export const saidOn = (catalogue: Catalogue, subject: Subject): ReadonlyArray<SaidComment> =>
  commentsOn(catalogue, subject).map((c) => ({ ...c, onThis: c.key === subject.key }));

const SceneSpan = Schema.Struct({ start: Schema.Finite, dur: Schema.Finite });
type SceneSpan = typeof SceneSpan.Type;

export const ProjectScene = Schema.Struct({
  scene: Schema.String,
  key: Schema.String,
  state: VariantState,
  staleBy: maybe(StaleBy),
  approval: ApprovalState,
  render: maybe(Render),
  span: maybe(SceneSpan),
  drawn: maybe(Schema.Boolean),
  comments: Schema.Array(SaidComment),
});
export type ProjectScene = typeof ProjectScene.Type;

const ProjectAct = Schema.Struct({
  name: ActName,
  scenes: Schema.Array(Schema.String),
  key: Schema.String,
  comments: Schema.Array(SaidComment),
});
type ProjectAct = typeof ProjectAct.Type;

export const Gave = Schema.Struct({
  op: OpId,
  at: Schema.Finite,
  scenes: Schema.Array(Schema.String),
});
export type Gave = typeof Gave.Type;

const Took = Schema.Struct({ op: OpId, scenes: Schema.Array(Schema.String) });
type Took = typeof Took.Type;

export const Project = Schema.Struct({
  film: Schema.String,
  variant: Schema.String,
  key: Schema.String,
  sound: maybe(Schema.String),
  comments: Schema.Array(SaidComment),
  acts: Schema.Array(ProjectAct),
  scenes: Schema.Array(ProjectScene),
  gave: maybe(Gave),
  took: maybe(Took),
});
export type Project = typeof Project.Type;

export interface SceneKey {
  readonly scene: string;
  readonly key: string;
  readonly span?: SceneSpan;
  readonly drawn?: boolean;
}

export interface ActKey {
  readonly act: ActName;
  readonly scenes: ReadonlyArray<string>;
  readonly key: string;
}

export interface Keyed {
  readonly key: string;
  readonly sound: Option.Option<string>;
  readonly acts: ReadonlyArray<ActKey>;
  readonly scenes: ReadonlyArray<SceneKey>;
}

export const sceneSlot = (scene: string, variant: string): Slot => ({
  address: sceneAddress(scene),
  variant,
  kind: 'video',
});

export const partSubject = (address: Address, variant: string, key: string): Subject => ({
  ...topicOf({ address, variant }),
  key,
});

export const projectOf = (catalogue: Catalogue, keyed: Keyed, variant: string): Project => ({
  film: catalogue.film,
  variant,
  key: keyed.key,
  sound: keyed.sound,
  comments: saidOn(catalogue, partSubject({ _tag: 'Film' }, variant, keyed.key)),
  acts: keyed.acts.map((act): ProjectAct => ({
    name: act.act,
    scenes: act.scenes,
    key: act.key,
    comments: saidOn(catalogue, partSubject({ _tag: 'Act', act: act.act }, variant, act.key)),
  })),
  scenes: keyed.scenes.map(({ scene, key, span, drawn }): ProjectScene => {
    const render = renderIn(catalogue, sceneSlot(scene, variant));
    return {
      scene,
      key,
      ...renderState(render, { key, sound: keyed.sound }),
      approval: Option.match(render, {
        onNone: (): ApprovalState => 'none',
        onSome: (r) => approvalState(catalogue, subjectOf(r)),
      }),
      render,
      span: Option.fromUndefinedOr(span),
      drawn: Option.fromUndefinedOr(drawn),
      comments: saidOn(catalogue, {
        ...topicOf(sceneSlot(scene, variant)),
        key: Option.match(render, { onNone: () => key, onSome: renderVersion }),
      }),
    };
  }),
  gave: Option.none(),
  took: Option.none(),
});

interface Approved {
  readonly catalogue: Catalogue;
  readonly approved: ReadonlyArray<string>;
  readonly made: ReadonlyArray<string>;
}

export const approveCurrent = (
  catalogue: Catalogue,
  scenes: ReadonlyArray<SceneKey>,
  sound: Option.Option<string>,
  variant: string,
  at: number,
  op: OpId,
): Approved => {
  const current = scenes.flatMap(({ scene, key }) =>
    Option.toArray(
      Option.map(
        Option.filter(renderIn(catalogue, sceneSlot(scene, variant)), (r) =>
          Option.isNone(staleBy(r, { key, sound })),
        ),
        (render) => ({ scene, render }),
      ),
    ),
  );
  return {
    catalogue: current.reduce(
      (cat, { render }) => approve(cat, subjectOf(render), at, Option.some(op)),
      catalogue,
    ),
    approved: current.map(({ scene }) => scene),
    made: current
      .filter(({ render }) => approvalState(catalogue, subjectOf(render)) !== 'approved')
      .map(({ scene }) => scene),
  };
};

export const gaveOf = (made: ReadonlyArray<string>, at: number, op: OpId): Option.Option<Gave> =>
  Option.map(
    Option.liftPredicate(made, (m) => m.length > 0),
    (scenes) => ({ op, at, scenes }),
  );

export const tookOf = (
  given: Option.Option<OpId>,
  took: ReadonlyArray<string>,
): Option.Option<Took> => Option.map(given, (op) => ({ op, scenes: took }));
