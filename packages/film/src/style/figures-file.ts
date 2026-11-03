import { Record as Rec, Schema } from 'effect';
import { decoder } from './decode.ts';
import { type ComposedFigure, isComposed } from './figure.ts';
import type { RivePropSpec } from '../canvas/rive.ts';
import { DIRECTION, type Direction, inkAt } from './house.ts';
import { type Laid, overridesIn } from './override.ts';
import { Paper } from './paper.ts';
import { Length } from './parts/measure.ts';
import { drawFigure, drawHand } from './rig/draw.ts';
import { type Figure, figure as rigOf } from './rig/parts.ts';
import { type Element, fragment, ids } from './rig/rml.ts';

interface Placed {
  readonly name: string;
  readonly seed: number;
  readonly stage: number;
}

interface FigureBoard<H extends string = string> extends Placed {
  readonly figure: ComposedFigure<string>;
  readonly hands: H;
}

interface HandBoard extends Placed {
  readonly hand: Paper;
  readonly size?: number;
}

type Board = FigureBoard | HandBoard;

type HandKey<B> = { readonly [k in keyof B]: B[k] extends HandBoard ? k : never }[keyof B];

type Boards<B> = { readonly [k in keyof B]: FigureBoard<HandKey<B> & string> | HandBoard };

interface LaidFile {
  readonly weight: number;
  readonly baked?: boolean;
  readonly boards: Readonly<Record<string, Board>>;
}

type Shot = Pick<RivePropSpec, 'ink'>;

const FOLLOWS: Shot = { ink: inkAt };

const STILL: Shot = {};

interface FiguresFile<B> {
  readonly weight: number;
  readonly baked: boolean;
  readonly boards: B;
  readonly artboards: { readonly [k in keyof B & string]: string };
  readonly shot: Shot;
}

const PlacedFields = {
  name: Schema.NonEmptyString,
  seed: Schema.Int,
  stage: Schema.Finite,
};

const Composed = Schema.declare(isComposed, {
  expected: 'a figure `figure` returned, not a copy of one: compose a change from its spec',
});

const FigureBoardFields = Schema.Struct({
  ...PlacedFields,
  figure: Composed,
  hands: Schema.String,
});
const HandBoardFields = Schema.Struct({
  ...PlacedFields,
  hand: Paper,
  size: Schema.optionalKey(Length),
});
const FileFields = Schema.Struct({
  weight: Length,
  baked: Schema.optionalKey(Schema.Boolean),
  boards: Schema.Record(Schema.String, Schema.Union([FigureBoardFields, HandBoardFields])),
});

const namedOnce = Schema.makeFilter((file: typeof FileFields.Type) => {
  const names = Object.values(file.boards).map((b) => b.name);
  const twice = names.filter((name, i) => names.indexOf(name) !== i);
  return twice.length === 0 ? true : `an artboard's name is laid twice: ${twice.join(', ')}`;
});

const samePaper = Schema.toEquivalence(Paper);

const handsOnTheirHand = Schema.makeFilter((file: typeof FileFields.Type) => {
  const wrong = Object.entries(file.boards).flatMap(([key, b]) => {
    if (!('figure' in b)) return [];
    const on = file.boards[b.hands];
    if (on === undefined || !('hand' in on))
      return [`${key}'s hands are laid on ${b.hands}, which is no hand's artboard of the file`];
    return samePaper(on.hand, b.figure.hands.paper)
      ? []
      : [`${key}'s hands are laid on ${b.hands}, a hand of another paper`];
  });
  return wrong.length === 0 ? true : wrong.join('; ');
});

const checkFile = decoder(FileFields.check(namedOnce, handsOnTheirHand));

const namesOf = <K extends string>(boards: { readonly [k in K]: Placed }) =>
  Rec.map(boards, (b) => b.name);

export const figuresFile = <const B extends Boards<B>>(file: {
  readonly weight: number;
  readonly baked?: boolean;
  readonly boards: B;
}): FiguresFile<B> => {
  checkFile(file, 'figuresFile');
  return {
    ...file,
    baked: file.baked ?? false,
    artboards: namesOf<keyof B & string>(file.boards),
    shot: file.baked === true ? STILL : FOLLOWS,
  };
};

const isFigureBoard = (board: Board): board is FigureBoard => 'figure' in board;

const lineOf = (file: LaidFile): Direction => ({
  ...DIRECTION,
  weight: file.weight,
  baked: file.baked === true,
});

const rigOfBoard = (next: () => string, board: Board, line: Direction, stage = board.stage) =>
  rigOf(next, board.name, board.seed, stage, line);

const checkComposed = decoder(Composed);

const drawn = (rig: Figure, board: Board): Element[] =>
  isFigureBoard(board)
    ? drawFigure(rig, checkComposed(board.figure, board.name))
    : drawHand(rig, board.hand, board.size);

export const figuresRml = (file: LaidFile): string => {
  const next = ids();
  const line = lineOf(file);
  return fragment(Object.values(file.boards).flatMap((b) => drawn(rigOfBoard(next, b, line), b)));
};

const aloneRml = (file: LaidFile, board: FigureBoard): string => {
  const next = ids();
  const line = lineOf(file);
  const hands = file.boards[board.hands];
  return fragment(
    [board, ...(hands === undefined ? [] : [hands])].flatMap((b) =>
      drawn(rigOfBoard(next, b, line, 0), b),
    ),
  );
};

export const lockedPrints = (file: LaidFile) =>
  Object.entries(file.boards).flatMap(([item, b]) =>
    isFigureBoard(b) && b.figure.lock !== undefined
      ? [{ item, lock: b.figure.lock, print: aloneRml(file, b) }]
      : [],
  );

export const figureOverrides = (file: LaidFile): ReadonlyArray<Laid> =>
  Object.entries(file.boards).flatMap(([item, b]) => {
    if (!isFigureBoard(b)) return [];
    const { lock, ...parts } = b.figure;
    return [
      ...(lock?.override === undefined ? [] : [{ item, override: lock.override, since: lock.at }]),
      ...overridesIn(parts).map((override) => ({ item, override })),
    ];
  });
