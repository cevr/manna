import { Array as Arr, Boolean as Bool, Option, Order, Predicate, Result, Schema } from 'effect';
import { parse, readsWord } from './narration.ts';
import { repoJson } from './schema.ts';
import { Segment } from './segment.ts';

const PANELS_PER_BEAT = 3;

export const BoardName = Segment.check(
  Schema.isPattern(/^[A-Za-z0-9_-]+$/, {
    message: 'a name of letters, digits, `_` and `-`',
  }),
);
export type BoardName = typeof BoardName.Type;

export const boardNamed = Schema.decodeUnknownOption(BoardName);

export const PANEL_START = BoardName.make('start');

const TryMade = Schema.Literals(['generate', 'import', 'tweak']);
type TryMade = typeof TryMade.Type;

const BoardFileName = Segment.check(
  Schema.isPattern(/^[A-Za-z0-9_.-]+\.(png|jpe?g|webp)$/, {
    message: 'a file of the board folder (letters, digits, `_`, `.`, `-`; an image)',
  }),
);
type BoardFileName = typeof BoardFileName.Type;

const TryCast = Schema.Struct({
  member: Schema.String,
  file: Schema.String,
  sha256: Schema.String,
});
export type TryCast = typeof TryCast.Type;

export const BoardTry = Schema.Struct({
  n: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  file: BoardFileName,
  sha256: Schema.String,
  made: TryMade,
  prompt: Schema.optionalKey(Schema.String),
  refs: Schema.Array(Schema.String),
  cast: Schema.optionalKey(Schema.Array(TryCast)),
  words: Schema.optionalKey(Schema.Array(Schema.String)),
  note: Schema.optionalKey(Schema.String),
  from: Schema.optionalKey(Schema.String),
  at: Schema.String,
});
export type BoardTry = typeof BoardTry.Type;

export const PanelText = Schema.Union([
  Schema.TaggedStruct('Card', {
    to: Schema.optionalKey(BoardName),
    payoff: Schema.String.check(Schema.isNonEmpty()),
  }),
  Schema.TaggedStruct('Verse', {
    ref: Schema.String.check(Schema.isNonEmpty()),
    text: Schema.String.check(Schema.isNonEmpty()),
    phrase: Schema.String.check(Schema.isNonEmpty()),
  }),
]).pipe(Schema.toTaggedUnion('_tag'));
export type PanelText = typeof PanelText.Type;

export const Panel = Schema.Struct({
  id: Schema.String,
  beat: BoardName,
  at: BoardName,
  tries: Schema.Array(BoardTry),
  kept: Schema.optionalKey(Schema.Int),
  why: Schema.optionalKey(Schema.String),
  text: Schema.optionalKey(PanelText),
});
export type Panel = typeof Panel.Type;

export const BoardStyle = Schema.Struct({
  id: BoardName,
  name: Schema.String,
  block: Schema.String,
  ref: BoardFileName,
  sha256: Schema.String,
  world: Schema.optionalKey(Schema.String),
});
export type BoardStyle = typeof BoardStyle.Type;

const BeatApproval = Schema.Struct({
  beat: BoardName,
  kept: Schema.Array(Schema.Struct({ panel: Schema.String, try: Schema.Int })),
  at: Schema.String,
});
type BeatApproval = typeof BeatApproval.Type;

export const BoardFile = Schema.Struct({
  film: Schema.String,
  style: Schema.optionalKey(BoardStyle),
  panels: Schema.Array(Panel),
  approvals: Schema.Array(BeatApproval),
});
export type BoardFile = typeof BoardFile.Type;

export const BoardFileJson = repoJson(BoardFile);

export const emptyBoard = (film: string): BoardFile => ({ film, panels: [], approvals: [] });

export const panelId = (beat: string, at: string): string => `${beat}.${at}`;

export const TryExt = Schema.Literals(['png', 'jpg', 'jpeg', 'webp']);
export type TryExt = typeof TryExt.Type;

export const styleFile = (id: BoardName, ext: TryExt): BoardFileName =>
  BoardFileName.make(`style.${id}.${ext}`);

export const tryFile = (
  beat: BoardName,
  at: BoardName,
  n: number,
  ext: TryExt = 'png',
): BoardFileName => BoardFileName.make(`${beat}.${at}.${n}.${ext}`);

export const panelById = (board: BoardFile, id: string): Option.Option<Panel> =>
  Arr.findFirst(board.panels, (p) => p.id === id);

export const panelsOf = (board: BoardFile, beat: string): ReadonlyArray<Panel> =>
  board.panels.filter((p) => p.beat === beat);

const pictures = (board: BoardFile, beat: string): ReadonlyArray<Panel> =>
  panelsOf(board, beat).filter((p) => Predicate.isUndefined(p.text));

export const tryOf = (panel: Panel, n: number): Option.Option<BoardTry> =>
  Arr.findFirst(panel.tries, (t) => t.n === n);

export const shownTry = (panel: Panel): Option.Option<BoardTry> =>
  Option.orElse(
    Option.flatMap(Option.fromUndefinedOr(panel.kept), (n) => tryOf(panel, n)),
    () => Arr.head(panel.tries),
  );

export const panelStagedAt = (
  board: BoardFile,
  beat: string,
  marks: Readonly<Record<string, number>>,
  time: number,
): Option.Option<{ readonly panel: Panel; readonly shown: BoardTry }> => {
  const heardAt = (p: Panel): Option.Option<number> =>
    (p.at === PANEL_START && Option.some(0)) ||
    Option.filter(Option.fromUndefinedOr(marks[p.at]), (at) => at <= time);
  const held = pictures(board, beat).flatMap((panel) =>
    Option.toArray(Option.map(heardAt(panel), (at) => ({ panel, at }))),
  );
  return Arr.match(held, {
    onEmpty: () => Option.none(),
    onNonEmpty: (some) => {
      const { panel } = Arr.max(
        some,
        Order.mapInput(Order.Number, (h: (typeof some)[number]) => h.at),
      );
      return Option.map(shownTry(panel), (shown) => ({ panel, shown }));
    },
  });
};

export const nextTry = (panel: Panel): number =>
  Arr.reduce(panel.tries, 0, (most, t) => Math.max(most, t.n)) + 1;

export const plannedAts = (
  beat: string,
  say: Option.Option<string>,
  picture: Option.Option<string>,
): ReadonlyArray<BoardName> => {
  const named = new Set(
    [...Option.getOrElse(picture, () => '').matchAll(/`([A-Za-z0-9_-]+)`/g)].map((m) => m[1]),
  );
  const marks = Option.match(say, {
    onNone: (): ReadonlyArray<BoardName> => [],
    onSome: (text) =>
      Result.match(parse(beat, text), {
        onFailure: (): ReadonlyArray<BoardName> => [],
        onSuccess: (parsed) =>
          [...parsed.marks]
            .toSorted(([, a], [, b]) => a - b)
            .map(([name]) => name)
            .filter((name) => named.has(name))
            .flatMap((name) => Option.toArray(boardNamed(name))),
      }),
  });
  if (marks.length === 0) return [PANEL_START];
  return spread(marks, PANELS_PER_BEAT);
};

const spread = <A>(items: ReadonlyArray<A>, n: number): ReadonlyArray<A> => {
  if (items.length <= n) return items;
  const picks = Arr.makeBy(n, (i) => Math.round((i * (items.length - 1)) / (n - 1)));
  return Arr.dedupe(picks).flatMap((i) => Option.toArray(Arr.get(items, i)));
};

export const withPanel = (
  board: BoardFile,
  panel: Panel,
  order: ReadonlyArray<string>,
): BoardFile => {
  const others = board.panels.filter((p) => p.id !== panel.id);
  const rank = (p: Panel) => {
    const i = order.indexOf(p.id);
    if (i < 0) return order.length;
    return i;
  };
  return {
    ...board,
    panels: [...others, panel].toSorted((a, b) => rank(a) - rank(b)),
  };
};

export const withTries = (panel: Panel, tries: ReadonlyArray<BoardTry>): Panel => ({
  ...panel,
  tries: [...panel.tries, ...tries],
});

export interface BoardRefusal {
  readonly reason: string;
}

export const pickTry = (
  board: BoardFile,
  id: string,
  n: number,
  why: Option.Option<string>,
): Result.Result<BoardFile, BoardRefusal> => {
  const panel = panelById(board, id);
  if (Option.isNone(panel))
    return Result.fail({
      reason: `the board has no panel ${id} (it has ${board.panels.map((p) => p.id).join(', ') || 'none'})`,
    });
  if (Predicate.isNotUndefined(panel.value.text))
    return Result.fail({
      reason: `panel ${id} is a ${panel.value.text._tag.toLowerCase()} the engine sets: it has no tries to pick`,
    });
  if (Option.isNone(tryOf(panel.value, n)))
    return Result.fail({
      reason: `panel ${id} has no try ${n} (it has ${panel.value.tries.map((t) => t.n).join(', ') || 'none'})`,
    });
  const kept: Panel = Option.match(
    Option.filter(
      Option.map(why, (w) => w.trim()),
      (w) => w !== '',
    ),
    {
      onNone: () => {
        const { why: _why, ...rest } = panel.value;
        return { ...rest, kept: n };
      },
      onSome: (w) => ({ ...panel.value, kept: n, why: w }),
    },
  );
  return Result.succeed({
    ...board,
    panels: board.panels.map((p) =>
      Bool.match(p.id === id, { onTrue: () => kept, onFalse: () => p }),
    ),
  });
};

const BoardApprovalState = Schema.Literals(['none', 'approved', 'stale']);
type BoardApprovalState = typeof BoardApprovalState.Type;

const keptNow = (board: BoardFile, beat: string) =>
  pictures(board, beat).flatMap((p) =>
    Option.toArray(Option.map(Option.fromUndefinedOr(p.kept), (n) => ({ panel: p.id, try: n }))),
  );

export const approvalOf = (board: BoardFile, beat: string): BoardApprovalState =>
  Option.match(
    Arr.findFirst(board.approvals, (a) => a.beat === beat),
    {
      onNone: (): BoardApprovalState => 'none',
      onSome: (a) => {
        const now = pictures(board, beat);
        const same =
          now.length === a.kept.length &&
          now.every((p) => a.kept.some((was) => was.panel === p.id && was.try === p.kept));
        return Bool.match(same, {
          onTrue: (): BoardApprovalState => 'approved',
          onFalse: (): BoardApprovalState => 'stale',
        });
      },
    },
  );

export const approveBeat = (
  board: BoardFile,
  beat: BoardName,
  at: string,
): Result.Result<BoardFile, BoardRefusal> => {
  const panels = panelsOf(board, beat);
  if (panels.length === 0)
    return Result.fail({ reason: `beat ${beat} has no panel yet: make its board first` });
  const unpicked = pictures(board, beat)
    .filter((p) => Predicate.isUndefined(p.kept))
    .map((p) => p.id);
  if (unpicked.length > 0)
    return Result.fail({ reason: `pick a try of ${unpicked.join(', ')} first` });
  return Result.succeed({
    ...board,
    approvals: [
      ...board.approvals.filter((a) => a.beat !== beat),
      { beat, kept: keptNow(board, beat), at },
    ],
  });
};

export const withdrawBeat = (
  board: BoardFile,
  beat: string,
): Result.Result<BoardFile, BoardRefusal> => {
  if (!board.approvals.some((a) => a.beat === beat))
    return Result.fail({ reason: `beat ${beat}'s board is not approved` });
  return Result.succeed({ ...board, approvals: board.approvals.filter((a) => a.beat !== beat) });
};

export const cardLine = (
  beat: string,
  say: string,
  at: string,
  card: { readonly to?: string; readonly payoff: string },
): Result.Result<
  { readonly words: ReadonlyArray<string>; readonly payoff: number },
  BoardRefusal
> =>
  Result.flatMap(
    Result.mapError(parse(beat, say), () => ({ reason: `beat ${beat}: its line does not read` })),
    (parsed) => {
      const words = parsed.spoken.split(/\s+/).filter((w) => w.length > 0);
      const markAt = (name: string) =>
        Option.match(Option.fromUndefinedOr(parsed.marks.get(name)), {
          onNone: () =>
            Result.fail<BoardRefusal>({
              reason: `beat ${beat} has no mark {${name}} (it has ${[...parsed.marks.keys()].join(', ') || 'none'})`,
            }),
          onSome: (i) => Result.succeed(i),
        });
      const fromAt = Bool.match(at === PANEL_START, {
        onTrue: () => Result.succeed(0),
        onFalse: () => markAt(at),
      });
      return Result.flatMap(fromAt, (from) =>
        Result.flatMap(
          Option.match(Option.fromUndefinedOr(card.to), {
            onNone: () => Result.succeed(words.length),
            onSome: markAt,
          }),
          (to) => {
            const said = words.slice(from, to);
            if (said.length === 0)
              return Result.fail({ reason: `the card at ${beat}.${at} sets no words` });
            const payoff = said.findIndex((w) => readsWord(w, card.payoff));
            if (payoff < 0)
              return Result.fail({
                reason: `the card's payoff "${card.payoff}" is none of its words (${said.join(' ')})`,
              });
            return Result.succeed({ words: said, payoff });
          },
        ),
      );
    },
  );

interface OrderBeat {
  readonly id: string;
  readonly say: Option.Option<string>;
}

export const filmOrder = (
  beats: ReadonlyArray<OrderBeat>,
  ids: ReadonlyArray<string>,
): ReadonlyArray<string> => {
  const rank = new Map<string, number>();
  for (const [b, beat] of beats.entries()) {
    rank.set(panelId(beat.id, PANEL_START), b * 10_000 - 1);
    const marks = Option.match(beat.say, {
      onNone: () => new Map<string, number>(),
      onSome: (say) =>
        Result.getOrElse(
          Result.map(parse(beat.id, say), (p) => p.marks),
          () => new Map<string, number>(),
        ),
    });
    for (const [mark, word] of marks) rank.set(panelId(beat.id, mark), b * 10_000 + word);
  }
  const last = Number.MAX_SAFE_INTEGER;
  return ids
    .map((id, i) => ({
      id,
      i,
      r: Option.getOrElse(Option.fromUndefinedOr(rank.get(id)), () => last),
    }))
    .toSorted((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.id);
};

export const phraseIn = (text: string, phrase: string): boolean => {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const want = phrase.split(/\s+/).filter((w) => w.length > 0);
  if (want.length === 0) return false;
  for (let i = 0; i + want.length <= words.length; i++)
    if (want.every((w, k) => words[i + k] === w)) return true;
  return false;
};
