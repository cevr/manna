import { Option, Result } from 'effect';
import { parse } from '../../core/narration.ts';

interface LineWord {
  readonly marks: ReadonlyArray<string>;
  readonly text: string;
}

export const lineWords = (id: string, say: string): ReadonlyArray<LineWord> =>
  Result.match(parse(id, say), {
    onFailure: () => [],
    onSuccess: (parsed) => {
      const words = parsed.spoken.split(/\s+/).filter((w) => w.length > 0);
      const at = [...parsed.marks];
      return words.map((text, i) => ({
        marks: at.filter(([, index]) => index === i).map(([name]) => name),
        text,
      }));
    },
  });

export const panelWords = (
  line: ReadonlyArray<LineWord>,
  at: string,
  until: Option.Option<string>,
): string => {
  const index = (mark: string): number => {
    if (mark === 'start') return 0;
    return Option.getOrElse(
      Option.liftPredicate(
        line.findIndex((w) => w.marks.includes(mark)),
        (i) => i >= 0,
      ),
      () => line.length,
    );
  };
  const from = index(at);
  const to = Option.match(until, { onNone: () => line.length, onSome: index });
  return line
    .slice(from, Math.max(from, to))
    .map((w) => w.text)
    .join(' ');
};
