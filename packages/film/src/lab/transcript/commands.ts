import { Option } from 'effect';
import { type Context, selected } from '../../command/context.ts';
import { Selection, type WordsSelection } from '../../command/selection.ts';

const extendedTo = (
  selection: Option.Option<WordsSelection>,
  scene: string,
  index: number,
): WordsSelection => {
  const from = Option.getOrElse(
    Option.map(
      Option.filter(selection, (s) => s.scene === scene),
      (s) => s.from,
    ),
    () => index,
  );
  return Selection.cases.Words.make({
    scene,
    from: Math.min(from, index),
    to: Math.max(from, index),
  });
};

export const selectedTo = (
  ctx: Context,
  selection: Option.Option<WordsSelection>,
): Option.Option<WordsSelection> =>
  Option.flatMap(
    Option.filter(selected(ctx, 'Words'), (w) => w.from === w.to),
    (word) =>
      Option.filter(
        Option.map(
          Option.filter(selection, (s) => s.scene === word.scene),
          () => extendedTo(selection, word.scene, word.from),
        ),
        (to) => !Option.exists(selection, (s) => s.from === to.from && s.to === to.to),
      ),
  );
