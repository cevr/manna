/**
 * The held seek's decisions on a hymn page, apart from any platform's
 * listeners: where a hold and its drag land among the hymn's sung lines and
 * trusted words (`seek-targets.ts`), what one accessible step chooses, where
 * the chosen line's block sits in the viewport's middle, and which pointer
 * owns a hold. A drag is read from the place that was sounding when the hold
 * took (its eligible row and word column), never from the text under the
 * finger: `LINE_STEP` points a line up or down and `WORD_STEP` points a word
 * left or right, both from the same update, each clamped on its own, so a
 * return to the start returns to the first choice.
 */

import { RegistryContext, useAtomValue } from '@effect/atom-react';
import { Array as Arr, Data, Option } from 'effect';
import * as Atom from 'effect/reactivity/Atom';
import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  AccessibilityInfo,
  type HostInstance,
  Platform,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { useAccent } from '~/color';
import { plain, useCue } from '~/feel/cue';
import type { SeekTarget, SeekTargets } from '~/follow/seek-targets';
import { usePlayer } from '~/player/context';
import { Player } from '~/player/player';
import {
  bundledTargets,
  HoldCommand,
  HoldState,
  type HoldToken,
  type TargetsFor,
} from '~/player/word-seek';
import { settings } from '~/store';

/** How long a still hold takes before it pauses and chooses, in milliseconds. */
export const HOLD_MS = 350;
/** How far a finger may move, in points, before the hold takes; past it, the touch is a scroll or a page turn. */
export const SLOP = 10;
/** The drag that moves the choice one sung line, in points. */
export const LINE_STEP = 48;
/** The drag that moves the choice one word, in points. */
export const WORD_STEP = 24;

/** The hold's first choice as a place among the targets: its eligible row, and its word's column (0 on a line timed whole). */
export interface Anchor {
  readonly row: number;
  readonly column: number;
}

/** A choice among the targets: an eligible line by its place in the hymn as sung, and a trusted word on it, if any. */
export interface Choice {
  readonly line: number;
  readonly word: Option.Option<number>;
}

const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n));

const rowOf = (targets: SeekTargets, line: number) =>
  Arr.findFirstIndex(targets.lines, (one) => one.line === line);

/** A target's word column: its word, or 0 on a line timed whole. */
const columnOf = (target: SeekTarget) => {
  if (target._tag === 'Word') return target.word;
  return 0;
};

/** Which way a step goes: back is -1. */
const directionOf = (step: Step) => {
  if (step === 'prev-line' || step === 'prev-word') return -1;
  return 1;
};

/** Where a hold's initial target sits among the targets; none for a target they do not hold. */
export const anchorOf = (targets: SeekTargets, target: SeekTarget): Option.Option<Anchor> =>
  Option.map(rowOf(targets, target.line), (row) => ({ row, column: columnOf(target) }));

/** The choice at `row`, its word at `column` clamped to the line's words; a line timed whole has none. */
const choiceIn = (targets: SeekTargets, row: number, column: number): Option.Option<Choice> =>
  Option.map(Arr.get(targets.lines, row), (line) => {
    if (line._tag === 'LineOnly' || line.words.length === 0)
      return { line: line.line, word: Option.none() };
    const word = line.words[clamp(column, 0, line.words.length - 1)]?.word ?? 0;
    return { line: line.line, word: Option.some(word) };
  });

/**
 * The choice a drag of `dx`, `dy` points from where the hold took makes:
 * a line per `LINE_STEP` (up is later), a word per `WORD_STEP` (right is
 * later), both at once. None for a drag that is not finite.
 */
export const choiceAt = (
  targets: SeekTargets,
  anchor: Anchor,
  dx: number,
  dy: number,
): Option.Option<Choice> => {
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || targets.lines.length === 0)
    return Option.none();
  const row = clamp(anchor.row - Math.trunc(dy / LINE_STEP), 0, targets.lines.length - 1);
  return choiceIn(targets, row, anchor.column + Math.trunc(dx / WORD_STEP));
};

/** Whether `target` is the `choice`: the same line, and the same word or none. */
export const isChoice = (target: SeekTarget, choice: Choice): boolean => {
  if (target.line !== choice.line) return false;
  if (target._tag === 'Word') return Option.contains(choice.word, target.word);
  return Option.isNone(choice.word);
};

/** One accessible step of the choice. */
export type Step = 'prev-line' | 'next-line' | 'prev-word' | 'next-word';

/**
 * The choice one `step` from `target`: a line step keeps the word's column
 * (the first word from a line timed whole), clamped to the new line; a word
 * step stays on its line. None at an end, for a word step on a line timed
 * whole, and for a target the targets do not hold.
 */
export const stepFrom = (
  targets: SeekTargets,
  target: SeekTarget,
  step: Step,
): Option.Option<Choice> =>
  Option.flatMap(rowOf(targets, target.line), (row) => {
    const column = columnOf(target);
    if (step === 'prev-line' || step === 'next-line') {
      const next = row + directionOf(step);
      if (next < 0 || next >= targets.lines.length) return Option.none();
      return choiceIn(targets, next, column);
    }
    const line = targets.lines[row];
    if (target._tag !== 'Word' || line?._tag !== 'WordTimed') return Option.none();
    const next = column + directionOf(step);
    if (next < 0 || next >= line.words.length) return Option.none();
    return choiceIn(targets, row, next);
  });

/**
 * The scroll offset that sets a block `height` tall whose top is `top` (from
 * the top of the content without its held padding) mid-way down a viewport
 * `viewport` tall, with `pad` points of held padding over the content. None
 * for a measure that is not finite, a block of negative height or an empty
 * viewport; never below 0.
 */
export const centerOffset = (
  top: number,
  height: number,
  viewport: number,
  pad: number,
): Option.Option<number> => {
  if (![top, height, viewport, pad].every(Number.isFinite) || height < 0 || viewport <= 0)
    return Option.none();
  return Option.some(Math.max(0, pad + top + height / 2 - viewport / 2));
};

/** A choice as a reader hears it: numbers from 1, and whether its timing is the line's alone or shared. */
export interface Described {
  readonly row: number;
  readonly rows: number;
  /** The line's place in the hymn as sung, from 1. */
  readonly line: number;
  readonly word: Option.Option<{
    readonly ordinal: number;
    readonly of: number;
    /** The other words, from 1, that start on the same note. */
    readonly shared: ReadonlyArray<number>;
  }>;
}

/** `target` among the targets, numbered from 1; none for a target they do not hold. */
export const describe = (targets: SeekTargets, target: SeekTarget): Option.Option<Described> =>
  Option.map(rowOf(targets, target.line), (row) => {
    const line = targets.lines[row];
    let word: Described['word'] = Option.none();
    if (target._tag === 'Word' && line?._tag === 'WordTimed') {
      const onset = line.words.find((one) => one.word === target.word);
      word = Option.some({
        ordinal: target.word + 1,
        of: line.words.length,
        shared: (onset?.shared ?? []).filter((n) => n !== target.word).map((n) => n + 1),
      });
    }
    return { row: row + 1, rows: targets.lines.length, line: target.line + 1, word };
  });

/** What a screen reader says of a choice: its line and word by number, and its timing's limits. */
export const spoken = (described: Described): string => {
  const line = `Line ${described.row} of ${described.rows}, sung line ${described.line}`;
  return Option.match(described.word, {
    onNone: () => `${line}, Line timing only`,
    onSome: ({ ordinal, of, shared }) => {
      const word = `${line}, word ${ordinal} of ${of}`;
      if (shared.length === 0) return word;
      return `${word}, timing shared with word ${shared.join(' and ')}`;
    },
  });
};

/** Which pointer, if any, holds the lyric area, and where it landed. */
export type Contact = Data.TaggedEnum<{
  Idle: {};
  /** A still finger waits for the hold. */
  Candidate: { readonly id: number; readonly x: number; readonly y: number };
  Held: { readonly id: number; readonly x: number; readonly y: number };
}>;
export const Contact = Data.taggedEnum<Contact>();

/** What a pointer did on the lyric area, as the web reports it. */
export type PointerInput = Data.TaggedEnum<{
  /** A pointer went down: `startable` when it lands on words, not a control, while a hold could take. */
  Down: {
    readonly id: number;
    readonly primary: boolean;
    readonly button: number;
    readonly x: number;
    readonly y: number;
    readonly startable: boolean;
  };
  Move: { readonly id: number; readonly x: number; readonly y: number };
  Up: { readonly id: number; readonly button: number };
  /** The pointer was cancelled, or lost its capture. */
  Lost: { readonly id: number };
  Escape: {};
  /** The hold's time came for pointer `id`; `acquired` when the player took the hold. */
  Deadline: { readonly id: number; readonly acquired: boolean };
}>;
export const PointerInput = Data.taggedEnum<PointerInput>();

/** What the area does after an input. */
export type PointerEffect = Data.TaggedEnum<{
  None: {};
  /** Start the hold's timer. */
  Arm: {};
  /** Stop the hold's timer. */
  Disarm: {};
  /** The hold took: capture the pointer. */
  Capture: { readonly id: number };
  Drag: { readonly dx: number; readonly dy: number };
  Release: { readonly id: number };
  Cancel: { readonly id: number };
}>;
export const PointerEffect = Data.taggedEnum<PointerEffect>();

const none = PointerEffect.None();
const idle = Contact.Idle();

/**
 * The contact after `input`, and what to do. Only a primary pointer's main
 * button starts a hold, and only that pointer moves or ends it: another
 * pointer, button or lift never does. The contact is let go before the
 * release or cancel is done, so a capture lost by that release is ignored.
 */
export const contactAfter = (
  contact: Contact,
  input: PointerInput,
): readonly [Contact, PointerEffect] =>
  PointerInput.$match(input, {
    Down: ({ id, primary, button, x, y, startable }) => {
      if (contact._tag !== 'Idle' || !primary || button !== 0 || !startable)
        return [contact, none] as const;
      return [Contact.Candidate({ id, x, y }), PointerEffect.Arm()] as const;
    },
    Move: ({ id, x, y }) => {
      if (contact._tag === 'Idle' || contact.id !== id) return [contact, none] as const;
      if (contact._tag === 'Candidate') {
        if (Math.hypot(x - contact.x, y - contact.y) > SLOP)
          return [idle, PointerEffect.Disarm()] as const;
        return [contact, none] as const;
      }
      return [contact, PointerEffect.Drag({ dx: x - contact.x, dy: y - contact.y })] as const;
    },
    Up: ({ id, button }) => {
      if (contact._tag === 'Idle' || contact.id !== id || button !== 0)
        return [contact, none] as const;
      if (contact._tag === 'Candidate') return [idle, PointerEffect.Disarm()] as const;
      return [idle, PointerEffect.Release({ id })] as const;
    },
    Lost: ({ id }) => {
      if (contact._tag === 'Idle' || contact.id !== id) return [contact, none] as const;
      if (contact._tag === 'Candidate') return [idle, PointerEffect.Disarm()] as const;
      return [idle, PointerEffect.Cancel({ id })] as const;
    },
    Escape: () => {
      if (contact._tag === 'Candidate') return [idle, PointerEffect.Disarm()] as const;
      if (contact._tag === 'Held') return [idle, PointerEffect.Cancel({ id: contact.id })] as const;
      return [contact, none] as const;
    },
    Deadline: ({ id, acquired }) => {
      if (contact._tag !== 'Candidate' || contact.id !== id) return [contact, none] as const;
      if (!acquired) return [idle, none] as const;
      return [
        Contact.Held({ id, x: contact.x, y: contact.y }),
        PointerEffect.Capture({ id }),
      ] as const;
    },
  });

/** No preview on a line. */
export const UNCHOSEN = -3;
/** The line is chosen with no word: its timing is the line's alone. */
export const LINE_CHOSEN = -1;

/** The held seek's choice as each line reads it, told only to the lines it leaves and reaches. */
export interface PreviewMarks {
  /** Line `line`'s preview: `UNCHOSEN`, `LINE_CHOSEN` or its chosen word's ordinal. */
  readonly markOf: (line: number) => number;
  readonly subscribe: (line: number, listener: () => void) => () => void;
  readonly set: (target: Option.Option<SeekTarget>) => void;
}

const markOfTarget = (target: SeekTarget) => {
  if (target._tag === 'Word') return target.word;
  return LINE_CHOSEN;
};

export const previewMarksOf = (): PreviewMarks => {
  let current = { line: -1, mark: UNCHOSEN };
  const listeners = new Map<number, Set<() => void>>();
  const tell = (line: number) => listeners.get(line)?.forEach((listener) => listener());
  return {
    markOf: (line) => {
      if (line !== current.line) return UNCHOSEN;
      return current.mark;
    },
    subscribe: (line, listener) => {
      const set = listeners.get(line) ?? new Set();
      set.add(listener);
      listeners.set(line, set);
      return () => {
        set.delete(listener);
        if (set.size === 0) listeners.delete(line);
      };
    },
    set: (target) => {
      const was = current;
      current = Option.match(target, {
        onNone: () => ({ line: -1, mark: UNCHOSEN }),
        onSome: (one) => ({ line: one.line, mark: markOfTarget(one) }),
      });
      if (was.line === current.line && was.mark === current.mark) return;
      tell(was.line);
      if (current.line !== was.line) tell(current.line);
    },
  };
};

const PreviewContext = createContext<PreviewMarks>(previewMarksOf());

export const PreviewProvider = PreviewContext.Provider;

/** Line `index`'s held-seek preview: `UNCHOSEN`, `LINE_CHOSEN` or the chosen word's ordinal. */
export const useLinePreview = (index: number): number => {
  const marks = use(PreviewContext);
  const subscribe = useCallback(
    (listener: () => void) => marks.subscribe(index, listener),
    [marks, index],
  );
  const read = () => marks.markOf(index);
  return useSyncExternalStore(subscribe, read, read);
};

/**
 * Line `index`'s held-seek treatment: an outline round the chosen line, and
 * an underline in the accent under every syllable of its chosen word. Neither
 * moves a glyph, and neither is colour alone.
 */
export const useSeekTreatment = (index: number) => {
  const mark = useLinePreview(index);
  const accent = useAccent();
  const line = mark !== UNCHOSEN && {
    outlineWidth: 2,
    outlineStyle: 'solid' as const,
    outlineOffset: 2,
    outlineColor: accent,
    borderRadius: 4,
  };
  const word = {
    color: accent,
    textDecorationLine: 'underline' as const,
    textDecorationStyle: 'solid' as const,
    textDecorationColor: accent,
  };
  return {
    line,
    word: (ordinal: number) => mark >= 0 && mark === ordinal && word,
  };
};

/** Where a page's seek targets come from: the bundled score, or a fixture's (the development probe's). */
const TargetsContext = createContext<TargetsFor>(bundledTargets);

export const SeekTargetsProvider = TargetsContext.Provider;

/**
 * The page's chord presses, so a hold never takes from a chord: a chord's
 * press began (its own target and hit slop, as the press decides it) within
 * a hold's time before the hold would take.
 */
export interface ChordTouch {
  readonly pressed: () => void;
  readonly recent: () => boolean;
}

/** How long after a chord's press began a hold still counts as that press's touch, past the hold's own time. */
const CHORD_GRACE = 250;

/** A page's chord presses, timed by `now` in milliseconds. */
export const chordTouchOf = (now: () => number): ChordTouch => {
  let at = Number.NEGATIVE_INFINITY;
  return {
    pressed: () => {
      at = now();
    },
    recent: () => now() - at <= HOLD_MS + CHORD_GRACE,
  };
};

const ChordTouchContext = createContext<ChordTouch>({ pressed: () => {}, recent: () => false });

export const ChordTouchProvider = ChordTouchContext.Provider;

export const useChordTouch = (): ChordTouch => use(ChordTouchContext);

/** What a platform's hold adapter wraps: the page's sung words, and the page's held seek. */
export interface SeekAreaProps {
  readonly seek: WordSeek;
  readonly style: StyleProp<ViewStyle>;
  readonly children: ReactNode;
}

/** Whether a page holds a held seek: the pager stays still while one does. */
export const seekHeld = Atom.make(false).pipe(Atom.keepAlive);

/**
 * The system's Reduce Motion, followed while the page is drawn: a scoped
 * listener, removed as the page goes.
 */
export const useReducedMotion = (): boolean => {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((on) => {
      if (live) setReduced(on);
    });
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      live = false;
      listener.remove();
    };
  }, []);
  return reduced;
};

/** Moves the screen reader's or the keyboard's focus to `view`. */
export const focusOn = (view: HostInstance) => {
  if (Platform.OS === 'web') {
    view.focus();
    return;
  }
  AccessibilityInfo.sendAccessibilityEvent(view, 'focus');
};

/** What the page's scroll does for a held seek (`follow.tsx`). */
export interface PreviewHost {
  /** Whether the lyric viewport is measured and the page is followed. */
  readonly ready: () => boolean;
  /** The seek took the page: the follow stands aside and the ends are padded. */
  readonly begin: () => void;
  /** Sets line `line`'s whole block mid-viewport, at once. */
  readonly center: (line: number) => void;
  /** The marker and the padding go, the scroll kept where the words were. */
  readonly finish: () => void;
  /** The player let the hold go: the follow takes the page again, to the line sung now when `restore`. */
  readonly end: (restore: boolean, animated: boolean) => void;
}

/** A hold this page began: its token, where it took, by which way, and how it is ending. */
interface Own {
  readonly token: HoldToken;
  readonly targets: SeekTargets;
  readonly anchor: Anchor;
  readonly via: 'pointer' | 'steps';
  ending: Option.Option<'Release' | 'Cancel'>;
}

const idlePlayer = Atom.make<Player>(Player.Idle());
const freeHold = Atom.make<HoldState>(HoldState.Free());
const noBeat = Atom.make(Option.none<unknown>());

/** The page's held seek: what it offers, what it shows, and the moves a gesture or a control makes. */
export interface WordSeek {
  /** Whether a hold could take now: the shown page's hymn plays, with no count-in, hold or pending act. */
  readonly available: boolean;
  /** How this page holds now, if it does. */
  readonly via: Option.Option<'pointer' | 'steps'>;
  /** The choice, while this page holds. */
  readonly target: Option.Option<SeekTarget>;
  readonly targets: Option.Option<SeekTargets>;
  readonly begin: (via: 'pointer' | 'steps') => boolean;
  readonly drag: (dx: number, dy: number) => void;
  readonly step: (step: Step) => void;
  readonly canStep: (step: Step) => boolean;
  readonly release: () => void;
  readonly cancel: () => void;
  readonly marks: PreviewMarks;
}

/**
 * Hymn `number`'s held seek on its page, over the player's hold seam
 * (`player/word-seek.ts`): it begins only on the `shown` page while the
 * hymn plays, anchors on the player's own first target, sends a Select only
 * when the choice changes, and ends once. A cue is told for each touch's
 * result: a grab as it takes, a tick for each changed choice, a release.
 * The page going (`shown` false, unmounted) or its words moving (`layout`)
 * revokes the hold; the player letting go of it, for any reason, clears it.
 */
export const useWordSeek = ({
  number,
  shown,
  layout,
  host,
}: {
  readonly number: number;
  readonly shown: boolean;
  /** The page's reading layout, as one key: a change revokes a hold. */
  readonly layout: string;
  readonly host: PreviewHost;
}): WordSeek => {
  const player = usePlayer();
  const registry = use(RegistryContext);
  const tell = useCue();
  const reduced = useReducedMotion();
  const targetsFor = use(TargetsContext);
  const choice = useAtomValue(settings.stanzas(number));
  const targets = useMemo(() => targetsFor(number, choice), [targetsFor, number, choice]);
  const atoms = Option.match(player, {
    onNone: () => ({ state: idlePlayer, hold: freeHold, beat: noBeat }),
    onSome: (it) => ({ state: it.state, hold: it.hold.state, beat: it.countIn }),
  });
  const playingHere = useAtomValue(
    atoms.state,
    (current) => Player.$is('Playing')(current) && current.track.number === number,
  );
  const hold = useAtomValue(atoms.hold);
  const counting = useAtomValue(atoms.beat, Option.isSome);
  const marks = useMemo(previewMarksOf, []);
  const own = useRef(Option.none<Own>());
  const [via, setVia] = useState(Option.none<'pointer' | 'steps'>());
  const now = useRef({ host, reduced, shown, targets });
  now.current = { host, reduced, shown, targets };

  const availableIn = (here: boolean, held: HoldState, counted: boolean) =>
    now.current.shown &&
    Option.isSome(player) &&
    here &&
    held._tag === 'Free' &&
    !counted &&
    Option.isSome(now.current.targets) &&
    Option.isNone(own.current) &&
    now.current.host.ready();
  const playsHere = (current: Player) =>
    Player.$is('Playing')(current) && current.track.number === number;
  const available = availableIn(playingHere, hold, counting);

  const ownTarget = (mine: Own): Option.Option<SeekTarget> => {
    const held = registry.get(atoms.hold);
    if (held._tag === 'Free' || held.token !== mine.token) return Option.none();
    return Option.some(held.target);
  };

  const clear = () => {
    marks.set(Option.none());
    registry.set(seekHeld, false);
    setVia(Option.none());
  };

  const begin = (how: 'pointer' | 'steps'): boolean => {
    if (Option.isNone(player) || Option.isNone(now.current.targets)) return false;
    const it = player.value;
    if (
      !availableIn(
        playsHere(registry.get(it.state)),
        registry.get(it.hold.state),
        Option.isSome(registry.get(it.countIn)),
      )
    )
      return false;
    const offered = now.current.targets.value;
    registry.set(it.hold.send, HoldCommand.Begin({ targets: offered }));
    const taken = registry.get(it.hold.state);
    if (taken._tag === 'Free') return false;
    if (taken._tag === 'Landing') return false;
    const anchor = anchorOf(offered, taken.target);
    if (Option.isNone(anchor)) {
      registry.set(it.hold.send, HoldCommand.Cancel({ token: taken.token }));
      return false;
    }
    own.current = Option.some({
      token: taken.token,
      targets: offered,
      anchor: anchor.value,
      via: how,
      ending: Option.none(),
    });
    now.current.host.begin();
    now.current.host.center(taken.target.line);
    marks.set(Option.some(taken.target));
    registry.set(seekHeld, true);
    setVia(Option.some(how));
    tell(plain('seek-grab'));
    return true;
  };

  const choose = (mine: Own, next: Option.Option<Choice>) => {
    if (Option.isNone(player) || Option.isNone(next) || Option.isSome(mine.ending)) return;
    const was = ownTarget(mine);
    if (Option.isNone(was) || isChoice(was.value, next.value)) return;
    registry.set(
      player.value.hold.send,
      HoldCommand.Select({ token: mine.token, line: next.value.line, word: next.value.word }),
    );
    const after = ownTarget(mine);
    if (Option.isNone(after) || isChoice(was.value, choiceOf(after.value))) return;
    marks.set(after);
    now.current.host.center(after.value.line);
    tell(plain('seek-tick'));
  };

  const drag = (dx: number, dy: number) =>
    Option.map(own.current, (mine) => {
      if (mine.via !== 'pointer') return;
      choose(mine, choiceAt(mine.targets, mine.anchor, dx, dy));
    });

  const stepOf = (mine: Own, kind: Step) =>
    Option.flatMap(ownTarget(mine), (target) => stepFrom(mine.targets, target, kind));

  const step = (kind: Step) =>
    Option.map(own.current, (mine) => {
      if (mine.via !== 'steps') return;
      choose(mine, stepOf(mine, kind));
    });

  const canStep = (kind: Step) =>
    Option.exists(
      own.current,
      (mine) =>
        mine.via === 'steps' && Option.isNone(mine.ending) && Option.isSome(stepOf(mine, kind)),
    );

  const finish = (ending: 'Release' | 'Cancel') =>
    Option.map(own.current, (mine) => {
      if (Option.isNone(player) || Option.isSome(mine.ending)) return;
      mine.ending = Option.some(ending);
      clear();
      now.current.host.finish();
      if (ending === 'Release') {
        tell(plain('seek-release'));
        registry.set(player.value.hold.send, HoldCommand.Release({ token: mine.token }));
      } else registry.set(player.value.hold.send, HoldCommand.Cancel({ token: mine.token }));
    });

  useEffect(
    () =>
      Option.match(player, {
        onNone: () => () => {},
        onSome: (it) =>
          registry.subscribe(it.hold.state, (held) =>
            Option.map(own.current, (mine) => {
              if (held._tag !== 'Free' && held.token === mine.token) return;
              own.current = Option.none();
              const restore = Option.isSome(mine.ending);
              if (!restore) {
                clear();
                now.current.host.finish();
              }
              now.current.host.end(restore && now.current.shown, !now.current.reduced);
            }),
          ),
      }),
    [player, registry],
  );

  const revoke = useCallback(
    (reason: 'route' | 'unmount' | 'timeline') =>
      Option.map(player, (it) => {
        if (Option.isSome(own.current))
          registry.set(it.hold.send, HoldCommand.Invalidate({ reason }));
      }),
    [player, registry],
  );
  useEffect(() => {
    if (!shown) revoke('route');
  }, [shown, revoke]);
  const laid = useRef(layout);
  useEffect(() => {
    if (laid.current === layout) return;
    laid.current = layout;
    revoke('timeline');
  }, [layout, revoke]);
  useEffect(() => () => void revoke('unmount'), [revoke]);

  return {
    available,
    via,
    target: Option.flatMap(own.current, ownTarget),
    targets,
    begin,
    drag,
    step,
    canStep,
    release: () => finish('Release'),
    cancel: () => finish('Cancel'),
    marks,
  };
};

/** A target as a choice. */
const choiceOf = (target: SeekTarget): Choice => {
  if (target._tag === 'Word') return { line: target.line, word: Option.some(target.word) };
  return { line: target.line, word: Option.none() };
};
