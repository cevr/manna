/* oxlint-disable effect/noNullish, effect/noTernary, eslint/complexity -- Exact's data module cannot import effect (docs/exact.md): a page with no timeline is undefined, as Exact's option is null on the wire, and the follow's host is one closure of the state the current follower's host keeps. */

/**
 * The follow on the hymn page shown, in the data module: the current
 * hymnal's own follower (`followerOf`) runs here, over the timeline Play
 * sings (`marks.ts`), told the player's view as the current `useFollow`
 * tells it (`reportOf`: Away unless the player holds the page's hymn
 * playing, waiting or paused; a count-in reported paused at its place; a
 * seek of any size told first). Its host is the call's time and three asks
 * the view answers: the next wake (a key and its ms, run by the Contract's
 * `after`), the last scroll (a key, the line and whether it moves), and the
 * hand pause (`held`, which shows Resume follow).
 *
 * The held seek on the page's words is the current hymnal's too: its web
 * adapter's pointer rule (`contactAfter`), the hold taken only while the
 * player plays the page's hymn, anchored at the place sounding then
 * (`initialTarget`), a drag choosing a line per `LINE_STEP` and a word per
 * `WORD_STEP` (`choiceAt`), a lift seeking there and playing on, a cancel
 * playing on where it paused. Exact gives a cancel as a lift
 * (`pointercancel` folds into `pointerup`), so a lift that never moved the
 * choice off its anchor, or that comes up more than `SLOP` from the
 * pointer's last place (the web's cancel lands at the page's corner), is
 * read as a cancel: a singer's slip resumes in place, never jumps.
 */

import { followerOf, type Follower, type Report } from '@manna/hymnal-app/follow/follower';
import { OFF } from '@manna/hymnal-app/follow/marks';
import { introAt, readingOf } from '@manna/hymnal-app/follow/intro-rules';
import type {
  Anchor,
  Contact,
  PointerInput,
  SeekTarget,
  SeekTargets,
} from '@manna/hymnal-app/reader/seek-rules';
import {
  SLOP,
  anchorOf,
  choiceAt,
  contactAfter,
  describe,
  initialTarget,
  isChoice,
  numbersOf,
  spoken,
  targetAt,
  targetsOf,
} from '@manna/hymnal-app/reader/seek-rules';
import type { Timeline } from '@manna/hymnal-app/player/stanzas';

import type { HymnText } from '../hymns/book.ts';
import { countLineOf, sungOf } from './marks.ts';

/** What the player's view tells the page: the hymn it holds, its phase and place (sung ms), its rate, its count-in and its last seek. */
export interface Told {
  readonly number: number;
  readonly phase: string;
  readonly at: number;
  readonly rate: number;
  readonly counting: boolean;
  readonly seek: number;
}

/** A hymn the follow can read: its text, as printed and sung, and its bundled timeline. */
export interface Followed {
  readonly hymn: HymnText;
  readonly timeline: Timeline | undefined;
}

export interface FollowView {
  readonly serial: number;
  /** The host's time this answer was made at, in ms: the wake is `wakeIn` after it. */
  readonly stamp: number;
  /** The page followed; 0 for none. */
  readonly page: number;
  /** The player is on the page's hymn: the reader's own scroll may pause the follow. */
  readonly here: boolean;
  /** The sung line, -1 for none, and its mark: `OFF`, `WHOLE`, or its sung syllable (-1 in a rest). */
  readonly line: number;
  readonly mark: number;
  /** The player counts in: the line is marked with nothing in it lit. */
  readonly counting: boolean;
  /** The reader's scroll holds the follow: Resume follow shows. */
  readonly held: boolean;
  /** The next wake, by key (0 for none), in ms from now. */
  readonly wake: number;
  readonly wakeIn: number;
  /** The last scroll asked, by key (0 for none): its line and whether it moves. */
  readonly scroll: number;
  readonly scrollLine: number;
  readonly scrollMoves: boolean;
  /** The line the count-in is drawn over. */
  readonly countLine: number;
  /** The intro before the first sung line, while the player holds the hymn before it. */
  readonly intro: boolean;
  readonly introShare: number;
  readonly introNow: number;
  readonly introText: string;
  /** The hold's timer, by key (0 for none), and whether a hold has the words. */
  readonly armed: number;
  readonly holding: boolean;
  /** The held choice: its line, its word (-1 for a line timed whole), and what a screen reader says of it. */
  readonly holdLine: number;
  readonly holdWord: number;
  readonly holdSaid: string;
  /** The choice's numbers as its accessible value (the current `SeekStatus`'s `numbersOf`). */
  readonly holdValue: string;
  /**
   * What the player is asked by the hold, once, by key: `pause` (the hold
   * takes), `seek` (to `askAt` sung seconds, then play on), `lift` (a
   * release that seeks nowhere: play on) or `resume` (a cancel: play on).
   */
  readonly ask: string;
  readonly askKey: number;
  readonly askAt: number;
  /** The last change of the held choice, by key (0 for none): the current hold's tick. */
  readonly tick: number;
}

/** A pointer's change on the page's words, by the Contract's event. */
export type Pointer = Readonly<
  { id: number; x: number; y: number } & (
    | { _tag: 'Down'; primary: boolean; button: number }
    | { _tag: 'Move' }
    | { _tag: 'Up'; button: number }
  )
>;

interface Hold {
  readonly targets: SeekTargets;
  readonly anchor: Anchor;
  readonly first: SeekTarget;
  readonly target: SeekTarget;
  /** The drag's last choice; none before the drag moves. */
  readonly choice: ReturnType<typeof choiceAt> | undefined;
}

/** A timeline of no lines: what the follower would read with no hymn placed, which never happens, as it is made only for a placed timeline. */
const EMPTY: Timeline = {
  tempo: { microsPerQuarter: 500_000, numerator: 4, denominator: 4 },
  lines: [],
  first: 0,
  end: 0,
};

/** The follow's state for one launch of the data module, and its inputs. */
export const followDesk = (hymnOf: (number: number) => Followed | undefined) => {
  let serial = 0;
  let keys = 0;
  let page = 0;
  let choiceKey = '';
  let follower: Follower | undefined;
  let sung: Timeline | undefined;
  let followed: Followed | undefined;
  let now = 0;
  let told: Told = { number: 0, phase: 'none', at: 0, rate: 1, counting: false, seek: 0 };
  let heard = 0;
  let counted = false;
  let wake: { key: number; ms: number; run: () => void } | undefined;
  let scroll = { key: 0, line: -1, moves: false };
  let contact: Contact = { _tag: 'Idle' };
  let armed = 0;
  let last = { x: 0, y: 0 };
  let hold: Hold | undefined;
  let ask = { kind: '', key: 0, at: 0 };
  let tick = 0;

  const here = () =>
    told.number === page &&
    page > 0 &&
    (told.phase === 'playing' || told.phase === 'buffering' || told.phase === 'paused');

  const reportOf = (): Report => {
    if (!here()) return { _tag: 'Away' };
    if (told.phase === 'buffering')
      return { _tag: 'Here', at: told.at, state: 'waiting', rate: told.rate };
    if (told.phase === 'paused' || told.counting)
      return { _tag: 'Here', at: told.at, state: 'paused', rate: told.rate };
    return { _tag: 'Here', at: told.at, state: 'playing', rate: told.rate };
  };

  /**
   * The timeline the follower reads: the one Play sings now, read through at
   * each use, so a hymn's words arriving after its lines (`src/timing/load.ts`)
   * mark syllables in the same follower, its line, scroll, hold and clock kept.
   */
  const live: Timeline = {
    get tempo() {
      return (sung ?? EMPTY).tempo;
    },
    get lines() {
      return (sung ?? EMPTY).lines;
    },
    get first() {
      return (sung ?? EMPTY).first;
    },
    get end() {
      return (sung ?? EMPTY).end;
    },
  };

  const make = () =>
    followerOf(live, {
      now: () => now,
      wake: (ms, run) => {
        keys += 1;
        const mine = { key: keys, ms, run };
        wake = mine;
        return () => {
          if (wake === mine) wake = undefined;
        };
      },
      scrollTo: (line, moves) => {
        keys += 1;
        scroll = { key: keys, line, moves };
      },
      log: () => {},
    });

  /** The follower for page `number` under the player's stanza choice for it, made again when either changes. */
  const place = (number: number, choice: ReadonlyArray<number>) => {
    const key = `${number}|${choice.join('.')}`;
    if (key === choiceKey) {
      retime(choice);
      return;
    }
    follower?.stop();
    choiceKey = key;
    page = number;
    hold = undefined;
    contact = { _tag: 'Idle' };
    armed = 0;
    followed = hymnOf(number);
    const timeline = followed?.timeline;
    sung =
      timeline === undefined || followed === undefined
        ? undefined
        : sungOf(timeline, followed.hymn.sections, choice);
    follower = sung === undefined ? undefined : make();
    heard = told.seek;
    counted = false;
  };

  /**
   * The page's hymn answers a new timeline (its words arrived): Play's cut of
   * it is read by the same follower from now on, which the report after
   * this ticks, so the sung line keeps its mark and its syllable is marked.
   */
  const retime = (choice: ReadonlyArray<number>) => {
    if (followed === undefined) return;
    const next = hymnOf(page);
    if (next?.timeline === undefined || next.timeline === followed.timeline) return;
    followed = next;
    sung = sungOf(next.timeline, next.hymn.sections, choice);
    follower ??= make();
  };

  const tell = () => {
    if (follower === undefined) return;
    if (told.seek !== heard) {
      heard = told.seek;
      follower.seek();
    }
    const report = reportOf();
    const starts = told.counting && report._tag === 'Here' && !counted;
    counted = told.counting && report._tag === 'Here';
    follower.report(report);
    if (starts) follower.show();
  };

  const asked = (kind: string, at = 0) => {
    keys += 1;
    ask = { kind, key: keys, at };
  };

  /** The hold's targets and anchor at the place sounding now, when the player plays the page's hymn. */
  const holdAt = (): Hold | undefined => {
    if (followed === undefined || followed.timeline === undefined || !here()) return undefined;
    if (told.phase !== 'playing' || told.counting) return undefined;
    const choice = choiceKey.split('|')[1] ?? '';
    const targets = targetsOf(
      followed.hymn,
      followed.timeline,
      choice === '' ? [] : choice.split('.').map(Number),
    );
    if (targets._tag === 'None') return undefined;
    const first = initialTarget(targets.value, told.at);
    if (first._tag === 'None') return undefined;
    const anchor = anchorOf(targets.value, first.value);
    if (anchor._tag === 'None') return undefined;
    return {
      targets: targets.value,
      anchor: anchor.value,
      first: first.value,
      target: first.value,
      choice: undefined,
    };
  };

  /** The hold ends: `seek` to its choice, `lift` (a release that seeks nowhere: play on) or `resume` (a cancel). */
  const end = (how: 'seek' | 'lift' | 'resume', moves: boolean) => {
    const was = hold;
    hold = undefined;
    if (was === undefined) return;
    if (how === 'seek') asked('seek', was.target.ms / 1000);
    else asked(how);
    follower?.endPreview(true, moves);
  };

  /** The held finger moved `dx`, `dy` from where it took: the choice there, and a tick when it changes. */
  const drag = (held: Hold, dx: number, dy: number) => {
    const choice = choiceAt(held.targets, held.anchor, dx, dy);
    if (choice._tag === 'None') return;
    const target = targetAt(held.targets, choice.value.line, choice.value.word);
    if (target._tag === 'None') return;
    if (!isChoice(held.target, choice.value)) {
      keys += 1;
      tick = keys;
    }
    hold = { ...held, target: target.value, choice };
  };

  /**
   * The held finger lifted at `up`: a lift away from its last move is a
   * cancel (Exact folds a pointercancel into the pointerup), a lift on a
   * choice it never moved from plays on, and any other seeks there.
   */
  const release = (held: Hold, up: { x: number; y: number } | undefined, moves: boolean) => {
    const away = up === undefined || Math.hypot(up.x - last.x, up.y - last.y) > SLOP;
    const made = held.choice;
    const stayed = made === undefined || made._tag === 'None' || isChoice(held.first, made.value);
    end(away ? 'resume' : stayed ? 'lift' : 'seek', moves);
  };

  const pointer = (input: PointerInput, up?: { x: number; y: number }, moves = true) => {
    const [next, effect] = contactAfter(contact, input);
    contact = next;
    if (effect._tag === 'Arm') {
      keys += 1;
      armed = keys;
    } else if (effect._tag === 'Disarm') armed = 0;
    else if (effect._tag === 'Capture') {
      armed = 0;
      hold = holdAt();
      if (hold === undefined) {
        contact = { _tag: 'Idle' };
        return;
      }
      follower?.beginPreview();
      asked('pause');
    } else if (effect._tag === 'Drag' && hold !== undefined) drag(hold, effect.dx, effect.dy);
    else if (effect._tag === 'Release' && hold !== undefined) release(hold, up, moves);
    else if (effect._tag === 'Cancel') end('resume', moves);
  };

  const view = (): FollowView => {
    serial += 1;
    const line = follower?.marks.line() ?? -1;
    const timeline = followed?.timeline;
    const intro =
      timeline !== undefined && here()
        ? introAt(timeline.first, told.at)
        : ({ _tag: 'None' } as const);
    const reading = intro._tag === 'Some' ? readingOf(intro.value) : { now: 0, text: '' };
    const said =
      hold === undefined ? { _tag: 'None' as const } : describe(hold.targets, hold.target);
    return {
      serial,
      stamp: now,
      page,
      here: here(),
      line,
      mark: line < 0 ? OFF : (follower?.marks.markOf(line) ?? OFF),
      counting: told.counting && here(),
      held: follower?.held.get() ?? false,
      wake: wake?.key ?? 0,
      wakeIn: wake?.ms ?? 0,
      scroll: scroll.key,
      scrollLine: scroll.line,
      scrollMoves: scroll.moves,
      countLine:
        sung === undefined || timeline === undefined ? 0 : countLineOf(sung, timeline.first),
      intro: intro._tag === 'Some',
      introShare: intro._tag === 'Some' ? intro.value.share : 0,
      introNow: reading.now,
      introText: reading.text,
      armed,
      holding: hold !== undefined,
      holdLine: hold?.target.line ?? -1,
      holdWord: hold?.target._tag === 'Word' ? hold.target.word : -1,
      holdSaid: said._tag === 'Some' ? spoken(said.value) : '',
      holdValue:
        said._tag === 'Some' && hold !== undefined ? numbersOf(said.value, hold.target.ms) : '',
      ask: ask.kind,
      askKey: ask.key,
      askAt: ask.at,
      tick,
    };
  };

  return {
    /** The player's view, read at `at` ms of the host's clock, on page `number` under `choice`. */
    report: (at: number, number: number, choice: ReadonlyArray<number>, next: Told) => {
      now = at;
      told = next;
      place(number, choice);
      tell();
      if (hold !== undefined && !here()) {
        hold = undefined;
        contact = { _tag: 'Idle' };
        follower?.endPreview(false, false);
      }
      return view();
    },
    /** The wake `key` came at `at`: run it if it is still the one asked. */
    wake: (at: number, key: number) => {
      now = at;
      if (wake !== undefined && wake.key === key) {
        const { run } = wake;
        wake = undefined;
        run();
      }
      return view();
    },
    /** The reader's own scroll began. */
    drag: (at: number) => {
      now = at;
      follower?.drag();
      return view();
    },
    /** Resume follow was pressed. */
    resume: (at: number) => {
      now = at;
      follower?.resume();
      return view();
    },
    /** The page's lines moved, or its scroll came to rest: the shown line back into place. */
    relayout: (at: number) => {
      now = at;
      follower?.relayout();
      return view();
    },
    /** A pointer's change on the words; `moves` is false under Reduce Motion. */
    pointer: (at: number, input: Pointer, moves: boolean) => {
      now = at;
      if (input._tag === 'Down') {
        last = { x: input.x, y: input.y };
        pointer({ ...input, startable: hold === undefined && here() });
      } else if (input._tag === 'Move') {
        last = { x: input.x, y: input.y };
        pointer(input);
      } else pointer({ _tag: 'Up', id: input.id, button: input.button }, input, moves);
      return view();
    },
    /** The hold's time came for timer `key`. */
    deadline: (at: number, key: number) => {
      now = at;
      if (key === armed && contact._tag === 'Candidate')
        pointer({ _tag: 'Deadline', id: contact.id, acquired: holdAt() !== undefined });
      return view();
    },
    view,
  };
};
