import { Schema } from 'effect';
import { type SoundCredit, creditLine } from '../core/sfx.ts';

export interface Author {
  readonly name: string;
  readonly citedAs?: string;
}

const CREDIT_MEASURE = 38;

export const Credit = Schema.Struct({
  text: Schema.String,
  kind: Schema.Literals(['name', 'head', 'item']),
  gap: Schema.Finite,
});
export type Credit = typeof Credit.Type;

interface Source {
  readonly author: string | undefined;
  readonly work: string;
}

const citedAsOf = (author: Author) => author.citedAs ?? author.name;

const authorOf = (cite: string, authors: ReadonlyArray<Author>): Source => {
  for (const author of authors) {
    const as = citedAsOf(author);
    if (author.citedAs !== undefined && cite.startsWith(as))
      return { author: author.name, work: cite.slice(as.length + 1) };
    if (cite.startsWith(`${as}, `)) return { author: author.name, work: cite.slice(as.length + 2) };
  }
  return { author: undefined, work: cite };
};

interface Cited {
  readonly title: string;
  readonly pages: ReadonlyArray<string>;
  readonly entry: string | undefined;
  readonly reprint: { readonly in: string; readonly pages: ReadonlyArray<string> } | undefined;
}

const DATED = /^(Letter|Ms) \d+, \d{4}/;
const PAGES = /^\d+(–\d+)?(, \d+(–\d+)?)*$/;
const REPRINT = /^(.*) \((\S+) ([^)]+)\)$/;

const citedOf = (work: string): Cited => {
  const reprint = REPRINT.exec(work);
  if (reprint !== null) {
    const [, title = '', book = '', pages = ''] = reprint;
    return { title, pages: [], entry: undefined, reprint: { in: book, pages: pages.split(', ') } };
  }
  const dated = DATED.exec(work);
  const cut = dated === null ? work.indexOf(', ') : dated[0].length;
  if (cut < 0 || cut >= work.length)
    return { title: work, pages: [], entry: undefined, reprint: undefined };
  const title = work.slice(0, cut);
  const rest = work.slice(cut + 2);
  return PAGES.test(rest)
    ? { title, pages: rest.split(', '), entry: undefined, reprint: undefined }
    : { title, pages: [], entry: rest, reprint: undefined };
};

const mergePages = (tokens: ReadonlyArray<string>): string[] => {
  const spans = tokens
    .map((t) => {
      const [a = 0, b = a] = t.split('–').map(Number);
      return [a, b] as const;
    })
    .toSorted((x, y) => x[0] - y[0] || y[1] - x[1]);
  const out: Array<readonly [number, number]> = [];
  for (const span of spans) {
    const last = out.at(-1);
    if (last !== undefined && span[0] <= last[1])
      out[out.length - 1] = [last[0], Math.max(last[1], span[1])];
    else out.push(span);
  }
  return out.map(([a, b]) => (a === b ? `${a}` : `${a}–${b}`));
};

const dateOf = (entry: string) => Date.parse(entry.replace(/, \d+$/, ''));

const workLines = (title: string, cited: ReadonlyArray<Cited>): string[] => {
  const pages = mergePages(cited.flatMap((c) => c.pages));
  const entries = [...new Set(cited.flatMap((c) => c.entry ?? []))].toSorted(
    (a, b) => dateOf(a) - dateOf(b),
  );
  const reprints = cited.flatMap((c) => (c.reprint === undefined ? [] : [c.reprint]));
  const words = title.split(' ');
  if (entries.length > 0 && entries.every((e) => !Number.isNaN(dateOf(e)))) {
    const issues = entries.map((e, i) => (i < entries.length - 1 ? `${e};` : e));
    const [first = '', ...more] = issues;
    const head = `${title}, ${first}`;
    return head.length <= CREDIT_MEASURE
      ? wrap([head, ...more], ' ')
      : [
          ...wrap(words, ' ').map((l, i, all) => (i === all.length - 1 ? `${l},` : l)),
          ...wrap(issues, ' '),
        ];
  }
  const last = words.pop() ?? '';
  const locator =
    reprints.length > 0
      ? `${last} (${reprints[0]?.in ?? ''} ${mergePages(reprints.flatMap((r) => r.pages)).join(', ')})`
      : pages.length > 0
        ? `${last}, ${pages.join(', ')}`
        : entries.length > 0
          ? `${last}, ${entries.join('; ')}`
          : last;
  return wrap([...words, locator], ' ');
};

const wrap = (parts: ReadonlyArray<string>, sep: string): string[] => {
  const lines: string[] = [];
  let line = '';
  for (const part of parts) {
    const next = line === '' ? part : `${line}${sep}${part}`;
    if (next.length > CREDIT_MEASURE && line !== '') {
      lines.push(line);
      line = part;
    } else line = next;
  }
  if (line !== '') lines.push(line);
  return lines;
};

const SOUND_HEAD = 'Sound';

const soundItems = (credit: SoundCredit): string[] => wrap(creditLine(credit).split(' '), ' ');

export const creditRoll = (
  title: string,
  cites: ReadonlyArray<string>,
  authors: ReadonlyArray<Author>,
  sounds: ReadonlyArray<SoundCredit> = [],
): ReadonlyArray<Credit> => {
  const unique = [...new Set(cites)];
  const out: Credit[] = [{ text: title, kind: 'name', gap: 0 }];
  const sources = unique.map((cite) => authorOf(cite, authors));
  out.push({ text: 'Scripture (King James Version)', kind: 'head', gap: 70 });
  for (const line of wrap(
    sources.filter((s) => s.author === undefined).map((s) => s.work),
    ' · ',
  ))
    out.push({ text: line, kind: 'item', gap: 0 });
  for (const { name: author } of authors) out.push(...authorCredits(author, sources));
  return [...out, ...soundSection(sounds)];
};

const authorCredits = (author: string, sources: ReadonlyArray<Source>): ReadonlyArray<Credit> => {
  const works = new Map<string, Cited[]>();
  for (const s of sources) {
    if (s.author !== author) continue;
    const cited = citedOf(s.work);
    works.set(cited.title, [...(works.get(cited.title) ?? []), cited]);
  }
  if (works.size === 0) return [];
  const out: Credit[] = [];
  for (const [j, line] of wrap(author.split(' '), ' ').entries())
    out.push({ text: line, kind: 'head', gap: j === 0 ? 46 : 0 });
  for (const [title, cited] of works)
    for (const line of workLines(title, cited)) out.push({ text: line, kind: 'item', gap: 0 });
  return out;
};

const soundSection = (sounds: ReadonlyArray<SoundCredit>): ReadonlyArray<Credit> => {
  if (sounds.length === 0) return [];
  return [
    { text: SOUND_HEAD, kind: 'head', gap: 46 },
    ...sounds.flatMap((credit) =>
      soundItems(credit).map((text): Credit => ({ text, kind: 'item', gap: 0 })),
    ),
  ];
};

export const missingSoundCredits = (
  roll: ReadonlyArray<Credit>,
  sounds: ReadonlyArray<SoundCredit>,
): ReadonlyArray<SoundCredit> => {
  const head = roll.findIndex((c) => c.kind === 'head' && c.text === SOUND_HEAD);
  const rest = head < 0 ? [] : roll.slice(head + 1);
  const end = rest.findIndex((c) => c.kind !== 'item');
  const given = (end < 0 ? rest : rest.slice(0, end)).map((c) => c.text);
  const runs = (lines: ReadonlyArray<string>) =>
    given.some((_, at) => lines.every((line, i) => given[at + i] === line));
  return sounds.filter((credit) => !runs(soundItems(credit)));
};
