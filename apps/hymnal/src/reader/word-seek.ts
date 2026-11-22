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
import type { NativeGesture } from 'react-native-gesture-handler';
import { Option } from 'effect';
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
import { AccessibilityInfo, type StyleProp, type ViewStyle } from 'react-native';

import { useAccent } from '~/color';
import { plain, useCue } from '~/feel/cue';
import type { SeekTarget, SeekTargets } from '~/follow/seek-targets';
import { usePlayer } from '~/player/context';
import {
  bundledTargets,
  HoldCommand,
  HoldState,
  type HoldToken,
  type TargetsFor,
} from '~/player/word-seek';
import { settings } from '~/store';

import {
  HOLD_MS,
  type Anchor,
  type Choice,
  anchorOf,
  choiceAt,
  isChoice,
  type Step,
  stepFrom,
  UNCHOSEN,
  LINE_CHOSEN,
} from './seek-rules';

export {
  HOLD_MS,
  SLOP,
  LINE_STEP,
  WORD_STEP,
  BACK_STRIP,
  type Anchor,
  type Choice,
  anchorOf,
  choiceAt,
  isChoice,
  type Step,
  stepFrom,
  centerOffset,
  type Described,
  describe,
  spoken,
  numbersOf,
  Contact,
  PointerInput,
  PointerEffect,
  contactAfter,
  UNCHOSEN,
  LINE_CHOSEN,
} from './seek-rules';

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

/**
 * The touch path's time: when a still pointer's hold time comes on the web,
 * and the clock a chord's press is timed by. The host's, or a test's by hand.
 */
export interface HoldTimer {
  /** Runs `run` after `ms`; the answer stops it. */
  readonly after: (ms: number, run: () => void) => () => void;
  /** Now, in milliseconds. */
  readonly now: () => number;
}

const hostTimer: HoldTimer = {
  after: (ms, run) => {
    // oxlint-disable-next-line effect/noGlobals -- the web adapter's hold timer: a host timer stopped with the pointer and the area, with no Effect run per touch.
    const timer = setTimeout(run, ms);
    return () => clearTimeout(timer);
  },
  // oxlint-disable-next-line effect/noGlobals -- the touch path's clock: a sync read of when a chord's press began, with no Effect run per touch.
  now: () => performance.now(),
};

const HoldTimerContext = createContext<HoldTimer>(hostTimer);

export const HoldTimerProvider = HoldTimerContext.Provider;

export const useHoldTimer = (): HoldTimer => use(HoldTimerContext);

/**
 * The native scrolls a held finger must win from, innermost first: the
 * page's own vertical scroll and the pager's horizontal one. The hold's
 * recognizer blocks each (`block`), so neither begins until the hold
 * fails: a finger that moves before its time lets them have the touch, and
 * one held still keeps it. Each scroll's own detector adds itself
 * (`WordSeek.native.tsx`, `HymnScreen.native.tsx`); the web has none.
 */
const ScrollsContext = createContext<ReadonlyArray<NativeGesture>>([]);

export const SeekScrollsProvider = ScrollsContext.Provider;

export const useSeekScrolls = (): ReadonlyArray<NativeGesture> => use(ScrollsContext);

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

/** What a screen reader's actions on the sung words do: take the hold, step it, play from it or cancel it. */
export type SeekAction = Step | 'seek' | 'release' | 'cancel';

const actionLabels: Record<SeekAction, string> = {
  seek: 'Seek by line or word',
  'prev-line': 'Previous line',
  'next-line': 'Next line',
  'prev-word': 'Previous word',
  'next-word': 'Next word',
  release: 'Play from here',
  cancel: 'Cancel',
};

const steps: ReadonlyArray<Step> = ['prev-line', 'next-line', 'prev-word', 'next-word'];

/**
 * The actions a screen reader offers on the sung words now: `seek` while a
 * hold would take, each step that moves the choice, `release` and `cancel`
 * while a hold this way is open; none while a finger holds.
 */
const seekActionsOf = (seek: WordSeek, available: boolean): ReadonlyArray<SeekAction> => {
  if (Option.isNone(seek.via)) return (available && ['seek']) || [];
  if (seek.via.value !== 'steps') return [];
  return [...steps.filter((step) => seek.canStep(step)), 'release', 'cancel'];
};

/** Does `action` on the page's held seek: the same Begin, Select, Release or Cancel a finger's hold makes. */
const runSeekAction = (seek: WordSeek, action: SeekAction) => {
  if (action === 'seek') return void seek.begin('steps');
  if (action === 'release') return seek.release();
  if (action === 'cancel') return seek.cancel();
  return seek.step(action);
};

const isSeekAction = (name: string): name is SeekAction => Object.hasOwn(actionLabels, name);

/** A sung line's accessibility actions and their handler, as the platform reads them. */
export interface SeekActionProps {
  readonly accessibilityActions?: ReadonlyArray<{ readonly name: string; readonly label: string }>;
  readonly onAccessibilityAction?: (event: {
    readonly nativeEvent: { readonly actionName: string };
  }) => void;
}

/**
 * The page's seek as a screen reader's actions, the same object until the
 * actions offered change: an action performed runs on the seek as it is
 * then, and only if it was offered.
 */
export const useSeekActionProps = (seek: WordSeek): SeekActionProps => {
  const available = useSeekAvailable(seek);
  const key = seekActionsOf(seek, available).join(' ');
  const now = useRef(seek);
  now.current = seek;
  return useMemo(() => {
    const names = key.split(' ').filter(isSeekAction);
    if (names.length === 0) return {};
    return {
      accessibilityActions: names.map((name) => ({ name, label: actionLabels[name] })),
      onAccessibilityAction: ({ nativeEvent }) => {
        const name = nativeEvent.actionName;
        if (isSeekAction(name) && names.includes(name)) runSeekAction(now.current, name);
      },
    } satisfies SeekActionProps;
  }, [key]);
};

const ActionsContext = createContext<SeekActionProps>({});

export const SeekActionsProvider = ActionsContext.Provider;

/** The held seek's actions a sung line carries, so a screen reader on any line offers them. */
export const useSeekActions = (): SeekActionProps => use(ActionsContext);

/** What the page's scroll does for a held seek (`follow.tsx`). */
export interface PreviewHost {
  /** Whether the lyric viewport is measured and the page is followed. */
  readonly ready: () => boolean;
  /** Tells `listener` each time `ready` may have changed; returns its end. */
  readonly subscribe: (listener: () => void) => () => void;
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

const freeHold = Atom.make<HoldState>(HoldState.Free());

/** The page's held seek: what it offers, what it shows, and the moves a gesture or a control makes. */
export interface WordSeek {
  /**
   * Whether a hold takes now: the page is seen, its viewport measured, and
   * the player's own `hold.canBegin` says a Begin offering its targets
   * takes. A part that draws it reads it through `useSeekAvailable`.
   */
  readonly available: () => boolean;
  /** Tells `listener` each time `available` may have changed; returns its end. */
  readonly subscribe: (listener: () => void) => () => void;
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
 * Which hymn page the reader sees, as a store a page reads without being
 * drawn again: the pager tells it each settle, and only the parts that
 * offer a hold follow it (`useSeekAvailable`), so a settle draws no page
 * it found mounted.
 */
export interface ShownPages {
  readonly isShown: (number: number) => boolean;
  readonly subscribe: (listener: () => void) => () => void;
}

/** A pager's store of the page seen, starting at `first`: `show` names the page seen, or none (`-1`). */
export const shownPagesOf = (first: number) => {
  let current = first;
  const listeners = new Set<() => void>();
  return {
    isShown: (number: number) => number === current,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    show: (number: number) => {
      if (number === current) return;
      current = number;
      listeners.forEach((listener) => listener());
    },
  };
};

/** Where no pager says otherwise (the web's one page, a test's), each page is the one seen. */
const everyPage: ShownPages = { isShown: () => true, subscribe: () => () => {} };

const ShownContext = createContext<ShownPages>(everyPage);

export const ShownPagesProvider = ShownContext.Provider;

/** The page's held seek's offer as a part draws it: drawn again as the page seen, the viewport or the player's word changes. */
export const useSeekAvailable = (seek: WordSeek): boolean =>
  useSyncExternalStore(seek.subscribe, seek.available, seek.available);

const FREE = 'Free';

/**
 * The hold as the page draws it: its stage and choice, as a value. The
 * player publishes its hold again as it polls; a page drawn again only when
 * this changes is not drawn again for each poll.
 */
const holdKey = (held: HoldState): string => {
  if (held._tag === 'Free') return FREE;
  const word = Option.getOrElse(
    Option.map(
      Option.liftPredicate(held.target, (target) => target._tag === 'Word'),
      (target) => target.word,
    ),
    () => -1,
  );
  return `${held._tag} ${held.target.line} ${word}`;
};

/**
 * Hymn `number`'s held seek on its page, over the player's hold seam
 * (`player/word-seek.ts`): it begins only on the page seen (`ShownPages`)
 * while the hymn plays, anchors on the player's own first target, sends a
 * Select only when the choice changes, and ends once. A cue is told for
 * each touch's result: a grab as it takes, a tick for each changed choice,
 * a release. The page going (no longer seen, unmounted) or its words moving
 * (`layout`) revokes the hold; the player letting go of it, for any reason,
 * clears it.
 */
export const useWordSeek = ({
  number,
  layout,
  host,
}: {
  readonly number: number;
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
    onNone: () => ({ hold: freeHold }),
    onSome: (it) => ({ hold: it.hold.state }),
  });
  useAtomValue(atoms.hold, holdKey);
  /** The player's own word on whether a Begin offering this page's targets takes now. */
  const offer = useMemo(
    () => Option.flatMap(player, (it) => Option.map(targets, it.hold.canBegin)),
    [player, targets],
  );
  const marks = useMemo(previewMarksOf, []);
  const own = useRef(Option.none<Own>());
  const [via, setVia] = useState(Option.none<'pointer' | 'steps'>());
  const pages = use(ShownContext);
  const now = useRef({ host, reduced, pages, targets, offer });
  now.current = { host, reduced, pages, targets, offer };
  const seen = () => now.current.pages.isShown(number);

  const available = () =>
    seen() &&
    Option.isNone(own.current) &&
    now.current.host.ready() &&
    Option.exists(now.current.offer, (atom) => registry.get(atom));
  const subscribe = useCallback(
    (listener: () => void) => {
      const stops = [
        pages.subscribe(listener),
        now.current.host.subscribe(listener),
        ...Option.toArray(Option.map(offer, (atom) => registry.subscribe(atom, listener))),
      ];
      return () => stops.forEach((stop) => stop());
    },
    [pages, registry, offer],
  );

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
    if (!available()) return false;
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
        onSome: (it) => {
          const told = (held: HoldState) =>
            Option.map(own.current, (mine) => {
              if (held._tag !== 'Free' && held.token === mine.token) return;
              own.current = Option.none();
              const restore = Option.isSome(mine.ending);
              if (!restore) {
                clear();
                now.current.host.finish();
              }
              now.current.host.end(restore && seen(), !now.current.reduced);
            });
          told(registry.get(it.hold.state));
          return registry.subscribe(it.hold.state, told);
        },
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
    const check = () => {
      if (!pages.isShown(number)) revoke('route');
    };
    check();
    return pages.subscribe(check);
  }, [pages, number, revoke]);
  const laid = useRef(layout);
  useEffect(() => {
    if (laid.current === layout) return;
    laid.current = layout;
    revoke('timeline');
  }, [layout, revoke]);
  const latest = useRef(revoke);
  latest.current = revoke;
  useEffect(() => () => void latest.current('unmount'), []);

  return {
    available,
    subscribe,
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
