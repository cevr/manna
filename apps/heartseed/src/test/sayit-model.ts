/* oxlint-disable effect/noNullish, effect/noTernary, effect/noGlobals -- the model reads the contract's nulls in the Dictation views it is given and holds an absent start, choice or suggestion as null as the view does, decides from plain branches, and compares two recalls by their JSON text. */

/**
 * Say it's model, written from the hssayit spec apart from the service.
 * Say it runs over Dictation (hsdictate's, verified against its own
 * model), so the model is given the Dictation view before and after each
 * step and says what Say it must have done by then: the listens and the
 * finishes it asked the source for, the ticks, the start and the choice,
 * and the recalls it kept, in order.
 *
 * - Each recital is of a piece: a press says the passage, a recital the
 *   piece it names (hsrun). While idle, a piece with no words starts
 *   nothing; a recall carries its own piece's reference and word count.
 * - A press is a recital with no cue that is kept (hsfirst). A recital
 *   while listening finishes; while idle it starts one under its cue,
 *   kept or not, which clears the choice and starts at the clock's time;
 *   while finishing it does nothing. The recital's zone offset is the
 *   host's at that start; travel after it changes no recall of it.
 * - Each word lit in a step's later view and not in the view last seen of
 *   the same recital ticks once; a recital's first view is diffed against
 *   nothing.
 * - An open source (one that never ends by itself) is finished once when
 *   its last word lights while it listens. A source that ends by itself
 *   may end before Say it sees that word lit, so its finish is allowed,
 *   not required.
 * - A recital that ends `finished` with a suggestion takes it as the
 *   choice; a grade of 1 to 4 then changes the choice, and nothing else
 *   does until the next press.
 * - While a kept recital is finished, each change of its recall is kept
 *   once; a recital that is not kept hands nothing over, ever.
 * - The matcher grades a cued recital as helped, so a finished recital
 *   under a cue is never suggested Good (`cuedGood` counts any that is).
 */

import { hostOffset } from './zone';

export type Status = 'pending' | 'tentative' | 'matched' | 'miss' | 'peek';

export interface ModelMatcher {
  readonly marks: readonly { readonly status: Status }[];
  readonly extraWordCount: number;
  readonly peekCount: number;
  readonly suggestedGrade: 1 | 2 | 3 | null;
}

export interface ModelDictation {
  readonly status: 'idle' | 'listening' | 'finishing';
  readonly matcher: ModelMatcher | null;
  readonly ended: string | null;
}

export type ModelGrade = 1 | 2 | 3 | 4;

export interface ModelRecall {
  readonly reference: string;
  readonly startedAt: number;
  readonly offset: number;
  readonly grade: ModelGrade;
  readonly suggested: 1 | 2 | 3;
  readonly words: number;
  readonly missed: number;
  readonly peeked: number;
  readonly extra: number;
}

export type ModelCue = 'none' | 'initials';

/** A piece a recital is said of: its reference and its word count. */
export interface ModelPiece {
  readonly reference: string;
  readonly words: number;
}

export type ModelStep =
  | { readonly t: 'press' }
  | {
      readonly t: 'recite';
      readonly cue: ModelCue;
      readonly keep: boolean;
      readonly piece: ModelPiece;
    }
  | { readonly t: 'wait'; readonly ms: number }
  | { readonly t: 'peek'; readonly index: number }
  | { readonly t: 'choose'; readonly grade: number }
  | { readonly t: 'travel'; readonly zone: string };

/** The indices of the words lit in a view. */
const litIn = (view: ModelDictation): ReadonlySet<number> =>
  new Set(
    (view.matcher?.marks ?? []).flatMap((mark, index) =>
      mark.status === 'matched' ? [index] : [],
    ),
  );

const lastLit = (view: ModelDictation) => view.matcher?.marks.at(-1)?.status === 'matched';

const asGrade = (grade: number): ModelGrade | null =>
  grade === 1 || grade === 2 || grade === 3 || grade === 4 ? grade : null;

interface Recital {
  readonly cue: ModelCue;
  readonly keep: boolean;
  readonly piece: ModelPiece;
  ended: boolean;
  suggested: 1 | 2 | 3 | null;
  kept: string | null;
}

export class SayItModel {
  ticks = 0;
  listens = 0;
  /** The finishes the source must have had. */
  finishes = 0;
  /** The most it may have had. */
  finishesAllowed = 0;
  startedAt: number | null = null;
  /** The host zone's offset at the press, by the wall clock's own fields: every keep of the recital carries it, wherever the device travels after. */
  offset: number | null = null;
  choice: ModelGrade | null = null;
  /** Finished recitals under a cue that the matcher suggested Good for: always 0. */
  cuedGood = 0;
  /** Finished recitals under a cue, and finished recitals that are not kept: how far a history reached. */
  cuedFinished = 0;
  unkeptFinished = 0;
  readonly kept: ModelRecall[] = [];
  private recital: Recital | null = null;
  private seen: ReadonlySet<number> = new Set();
  private lastSeenLit = false;

  /** `passage` is the piece a press says; `endsByItself`, whether the source ends a recital on its own. */
  constructor(
    readonly passage: ModelPiece,
    readonly endsByItself: boolean,
  ) {}

  step(step: ModelStep, before: ModelDictation, after: ModelDictation, now: number): void {
    const how =
      step.t === 'press'
        ? { cue: 'none' as const, keep: true, piece: this.passage }
        : step.t === 'recite'
          ? { cue: step.cue, keep: step.keep, piece: step.piece }
          : null;
    const finishedByPress = how !== null && before.status === 'listening';
    if (finishedByPress) {
      this.finishes += 1;
      this.finishesAllowed += 1;
    }
    if (how !== null && before.status === 'idle' && how.piece.words > 0) {
      this.listens += 1;
      this.startedAt = now;
      this.offset = hostOffset(now);
      this.choice = null;
      this.recital = { ...how, ended: false, suggested: null, kept: null };
      this.seen = new Set();
      this.lastSeenLit = false;
    }
    if (step.t === 'choose' && this.recital?.ended && this.recital.suggested !== null)
      this.choice = asGrade(step.grade) ?? this.choice;
    if (this.recital !== null && !this.recital.ended)
      this.follow(this.recital, how !== null, before.status === 'listening', after);
    this.keep(after);
  }

  /** The ticks, the finish at the last word, and the ending of the recital under way. */
  private follow(recital: Recital, pressed: boolean, listened: boolean, after: ModelDictation) {
    const lit = litIn(after);
    for (const index of lit) if (!this.seen.has(index)) this.ticks += 1;
    this.seen = lit;
    const reachedEnd = !this.lastSeenLit && lastLit(after);
    if (reachedEnd && !pressed) {
      this.finishesAllowed += 1;
      if (!this.endsByItself && listened) this.finishes += 1;
    }
    this.lastSeenLit = lastLit(after);
    if (after.status !== 'idle' || after.ended === null) return;
    recital.ended = true;
    const suggested = after.matcher?.suggestedGrade ?? null;
    if (after.ended !== 'finished' || suggested === null) return;
    recital.suggested = suggested;
    this.choice = suggested;
    if (recital.cue !== 'none') this.cuedFinished += 1;
    if (recital.cue !== 'none' && suggested === 3) this.cuedGood += 1;
    if (!recital.keep) this.unkeptFinished += 1;
  }

  /** Keeps the finished recital's recall when it is a kept recital and its recall changed. */
  private keep(after: ModelDictation) {
    const recital = this.recital;
    if (!recital?.ended || !recital.keep || recital.suggested === null) return;
    if (this.choice === null || this.startedAt === null || after.matcher === null) return;
    if (this.offset === null) return;
    const marks = after.matcher.marks;
    const recall: ModelRecall = {
      reference: recital.piece.reference,
      startedAt: this.startedAt,
      offset: this.offset,
      grade: this.choice,
      suggested: recital.suggested,
      words: recital.piece.words,
      missed: marks.filter((mark) => mark.status === 'miss' || mark.status === 'peek').length,
      peeked: after.matcher.peekCount,
      extra: after.matcher.extraWordCount,
    };
    const key = JSON.stringify(recall);
    if (recital.kept === key) return;
    recital.kept = key;
    this.kept.push(recall);
  }
}
