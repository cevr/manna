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

import { Array as Arr, Data, Option } from 'effect';

import type { SeekTarget, SeekTargets } from '~/follow/seek-targets';

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
