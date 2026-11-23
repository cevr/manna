/* oxlint-disable effect/noNullish -- plain text readers for the ports' look tests: a regex group that did not match is undefined. */

/** The text between the brace that opens at `start` and the one that closes it. */
const bodyFrom = (text: string, start: number): string | undefined => {
  let depth = 0;
  for (let at = start; at < text.length; at++) {
    if (text[at] === '{') depth++;
    if (text[at] === '}') depth--;
    if (depth === 0) return text.slice(start + 1, at);
  }
  return undefined;
};

const PART =
  /(\w+)\s*:\s*(\[\s*\{|\{|'[^']*'|-?\d+(?:\.\d+)?\b|StyleSheet\.hairlineWidth|[\w.]+)|(\}\s*\]|\})/gu;

/**
 * What the Exact ports' look tests read of a One (React Native) file: the
 * properties of `style` in the first `StyleSheet.create` of `source`
 * that names it, each as written (`'600'` with its quotes, `17`,
 * `StyleSheet.hairlineWidth`). A property of a nested object is named by
 * its path: `shadowOffset.height`, `transform.scale`. Undefined when no
 * sheet of the file has the style.
 */
export const styleIn = (source: string, style: string): ReadonlyMap<string, string> | undefined => {
  const sheet = source.indexOf('StyleSheet.create(');
  if (sheet < 0) return undefined;
  const named = new RegExp(`[\\s{,]${style}\\s*:\\s*\\{`, 'gu');
  named.lastIndex = sheet;
  const found = named.exec(source);
  if (found === null) return undefined;
  const body = bodyFrom(source, found.index + found[0].length - 1);
  if (body === undefined) return undefined;
  const props = new Map<string, string>();
  const path: string[] = [];
  for (const [, key, value, close] of body.matchAll(PART)) {
    if (close !== undefined) {
      path.pop();
      continue;
    }
    if (key === undefined || value === undefined) continue;
    if (value.startsWith('{') || value.startsWith('[')) path.push(key);
    else props.set([...path, key].join('.'), value);
  }
  return props;
};

/** The attributes that write a measure: a size, a weight, a space, a radius, a line's width, a shadow, a duration, a press. */
const MEASURE = [
  'font',
  'font-size',
  'font-weight',
  'line-height',
  'letter-spacing',
  '(?:min-|max-)?(?:width|height)',
  'flex-basis',
  'padding(?:-(?:top|right|bottom|left|inline|block)(?:-(?:start|end))?)?',
  'margin(?:-(?:top|right|bottom|left|inline|block)(?:-(?:start|end))?)?',
  '(?:row-|column-)?gap',
  'inset',
  'top',
  'right',
  'bottom',
  'left',
  'border(?:-(?:top|right|bottom|left)(?:-(?:left|right))?)?-radius',
  'border(?:-(?:top|right|bottom|left))?-width',
  'border(?:-(?:top|right|bottom|left))?',
  'box-shadow',
  'text-shadow',
  'transition(?:-duration|-delay)?',
  'animation(?:-duration|-delay)?',
  '-exact-press-scale',
  '-exact-press-opacity',
].join('|');

const ATTRIBUTE = new RegExp(
  `(?:^|\\s)(${MEASURE})=("[^"]*"|\\((?:[^()]|\\([^()]*\\))*\\)|[^\\s]+)`,
  'gu',
);

/** A number, bare or with a unit, not part of a name (`space.8`, `-exact-title2`): what a token stands for. Zero is no measure. */
const NUMBER = /(?<![\w.*/-])(-?(?:\d+\.?\d*|\.\d+))(px|pt|rem|em|ms|s)?(?![\w%.])/gu;

/** A factor or divisor of `calc` (`* 2`, `/ 3`): no measure of its own. */
const FACTOR = /[*/]\s*-?(?:\d+\.?\d*|\.\d+)(?![\w%.])/gu;

const literalIn = (value: string) =>
  [...value.replaceAll(FACTOR, '').matchAll(NUMBER)].some(
    ([, digits = '0']) => Number(digits) !== 0,
  );

/**
 * Each measure a Contract file writes as a literal, as `attribute=value`
 * (`padding=20`, `font-size="0.9rem"`, `gap=(on ? 8 : 0)`), once for each
 * place it is written; a comment line writes none. A value that names
 * tokens only (`padding="space.page"`, `calc(space.8 * 2)`), zero, or a
 * share (`100%`) is no literal.
 */
export const measureLiterals = (contract: string): ReadonlyArray<string> =>
  contract
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .flatMap((line) =>
      [...line.matchAll(ATTRIBUTE)]
        .filter(([, , value = '']) => literalIn(value))
        .map(([, name = '', value = '']) => `${name}=${value}`),
    );

/** An allow list against what a file writes: what it writes past the list, and what the list keeps that it no longer writes. */
export interface Overrun {
  readonly extra: ReadonlyArray<string>;
  readonly stale: ReadonlyArray<string>;
}

/**
 * What `found` holds beyond what `allowed` lets it keep (each entry as
 * many times as its count), and what `allowed` keeps that `found` no
 * longer holds: an allowance spent is taken off the list.
 */
export const beyond = (
  found: ReadonlyArray<string>,
  allowed: Readonly<Record<string, number>>,
): Overrun => {
  const left = new Map(Object.entries(allowed));
  const extra: string[] = [];
  for (const each of found) {
    const times = left.get(each) ?? 0;
    if (times > 0) left.set(each, times - 1);
    else extra.push(each);
  }
  const stale = [...left].flatMap(([each, times]) => Array.from({ length: times }, () => each));
  return { extra, stale };
};
