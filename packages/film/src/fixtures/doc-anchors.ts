import { Boolean as Bool, Effect, FileSystem, Option, Path } from 'effect';
import { Glob } from 'bun';

export interface Doc {
  readonly path: string;
  readonly text: string;
  readonly bases: ReadonlyArray<string>;
  readonly whole: boolean;
}

export const matches = (text: string, pattern: RegExp): ReadonlyArray<RegExpExecArray> =>
  Array.from(text.matchAll(pattern));

export const firstGroup = (m: RegExpExecArray) =>
  Option.getOrElse(Option.fromUndefinedOr(m[1]), () => '');

export const group = (m: RegExpExecArray, n: number) =>
  Option.getOrElse(Option.fromUndefinedOr(m[n]), () => '');

export interface Anchor {
  readonly written: string;
  readonly path: string;
  readonly line: boolean;
  readonly receipt: boolean;
  readonly symbols: ReadonlyArray<string>;
  readonly link: boolean;
}

export const ANOTHER_REPO = /^\| `(?!film\/)[\w-]+\/[\w.-]+` +\|/;

export interface Line {
  readonly text: string;
  readonly code: boolean;
}

export interface Markdown {
  readonly lines: ReadonlyArray<Line>;
  readonly links: ReadonlyArray<string>;
}

const CODE = '\u0000';

const spanOf = (text: string) => {
  const fence = '`'.repeat(Math.max(0, ...matches(text, /`+/g).map((m) => m[0].length)) + 1);
  const pad = ' '.repeat(Number(text.startsWith('`') || text.endsWith('`')));
  return `${fence}${pad}${text}${pad}${fence}`;
};

const block = (children: string) => `\n${children}\n`;

const URL_TARGET = /^[a-z][\w+.-]*:/i;

export const markdownOf = (text: string, linkText: 'all' | 'local' = 'all'): Markdown => {
  const links: Array<string> = [];
  const shown = (children: string, target: string) => {
    if (linkText === 'local' && URL_TARGET.test(target)) return '';
    return children;
  };
  const out = Bun.markdown.render(text, {
    heading: block,
    paragraph: block,
    listItem: block,
    table: block,
    html: block,
    hr: block,
    tr: (cells) => `\n|${cells}\n`,
    th: (cell) => ` ${cell} |`,
    td: (cell) => ` ${cell} |`,
    code: (lines) =>
      block(
        lines
          .replace(/\n$/, '')
          .split('\n')
          .map((line) => `${CODE}${line}`)
          .join('\n'),
      ),
    codespan: spanOf,
    link: (children, { href }) => {
      links.push(href);
      return shown(children, href);
    },
    image: (children, { src }) => {
      links.push(src);
      return shown(children, src);
    },
  });
  return {
    lines: out
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => ({ text: line.replace(CODE, ''), code: line.startsWith(CODE) })),
    links,
  };
};

const linksIn = (markdown: Markdown): ReadonlyArray<Anchor> =>
  markdown.links
    .map((target) => target.replace(/[#?].*$/, ''))
    .filter((target) => target !== '' && !URL_TARGET.test(target) && !target.startsWith('/'))
    .map((target) => ({
      written: target,
      path: target.replace(/\/$/, ''),
      line: false,
      receipt: false,
      symbols: [],
      link: true,
    }));

const spannedIn = (markdown: Markdown): ReadonlyArray<Anchor> =>
  markdown.lines
    .map((line) => line.text)
    .filter((line) => !ANOTHER_REPO.test(line))
    .flatMap((line) =>
      matches(
        line,
        /`([\w@-][\w.@-]*\/[^`\s]*)`((?:\s+`[^`\n]+`(?:,\s+`[^`\n]+`)*)?)(\s+(?:at\s+`[0-9a-f]{7,40}`|deleted\b))?/g,
      ).flatMap((m) => {
        const written = firstGroup(m);
        if (/[<*{…]/.test(written)) return [];
        const path = written.replace(/:[\d,-]+$/, '').replace(/\/$/, '');
        return [
          {
            written,
            path,
            line: path !== written.replace(/\/$/, ''),
            receipt: group(m, 3) !== '',
            symbols: matches(group(m, 2), /`([^`]+)`/g)
              .map(firstGroup)
              .filter(
                (symbol) =>
                  /\.\w+$/.test(path) && /^(?:'[\w-]+'|[A-Za-z_$][\w$.]*(?:\(.*\))?)$/.test(symbol),
              ),
            link: false,
          },
        ];
      }),
    );

export const anchorsIn = (doc: Doc): ReadonlyArray<Anchor> => {
  const markdown = markdownOf(doc.text);
  return [...spannedIn(markdown), ...linksIn(markdown)];
};

export const FILM_SRC = 'packages/film/src';
export const DESIGN_LANGUAGE = 'design-language/design-language.md';

export const SPANNED: ReadonlyArray<readonly [string, ReadonlyArray<string>]> = [
  ['NORTH_STAR.md', ['', FILM_SRC]],
  ['PRIOR_ARTS.md', ['', FILM_SRC]],
  ['apps/animations/README.md', ['', 'apps/animations', 'apps/animations/src', FILM_SRC]],
];

export const ANCHORED: ReadonlyArray<readonly [string, ReadonlyArray<string>]> = [
  ['CLAUDE.md', ['', 'packages/core']],
  ['packages/ui/README.md', ['', 'packages/ui']],
  ['packages/url-state/README.md', ['', 'packages/url-state']],
  ['packages/atom-solid/README.md', ['', 'packages/atom-solid']],
  ['apps/egw-search/README.md', ['', 'apps/egw-search']],
  [DESIGN_LANGUAGE, ['', FILM_SRC]],
];

export const SKILL_DIRS = ['.claude/skills/film', '.claude/skills/film-architecture-loop'];

export const VERIFY_SKILLS: ReadonlyArray<readonly [string, string]> = [
  ['.claude/skills/verify-firsttheblade', 'apps/firsttheblade'],
  ['.claude/skills/verify-hymnal', 'apps/hymnal'],
];

export interface DocPlace extends Omit<Doc, 'text'> {
  readonly role: 'framework' | 'spanned' | 'anchored' | 'verify';
}

export const docPlaces = (root: string): ReadonlyArray<DocPlace> => [
  {
    path: 'packages/film/README.md',
    bases: ['', 'packages/film', FILM_SRC],
    whole: false,
    role: 'framework',
  },
  ...SKILL_DIRS.flatMap((dir) =>
    Array.from(new Glob('**/*.md').scanSync({ cwd: `${root}/${dir}` }))
      .sort()
      .map((file): DocPlace => ({
        path: `${dir}/${file}`,
        bases: ['', FILM_SRC],
        whole: false,
        role: 'framework',
      })),
  ),
  ...SPANNED.map(([path, bases]): DocPlace => ({ path, bases, whole: false, role: 'spanned' })),
  ...ANCHORED.map(([path, bases]): DocPlace => ({ path, bases, whole: true, role: 'anchored' })),
  ...VERIFY_SKILLS.flatMap(([dir, app]) =>
    Array.from(new Glob('**/*.md').scanSync({ cwd: `${root}/${dir}` }))
      .sort()
      .map((file): DocPlace => ({
        path: `${dir}/${file}`,
        bases: ['', app],
        whole: true,
        role: 'verify',
      })),
  ),
];

export const readDoc = Effect.fn('docs.readDoc')(function* (root: string, place: DocPlace) {
  const fs = yield* FileSystem.FileSystem;
  const text = yield* fs.readFileString(`${root}/${place.path}`);
  return { path: place.path, text, bases: place.bases, whole: place.whole } satisfies Doc;
});

export const readAllDocs = (root: string) =>
  Effect.forEach(docPlaces(root), (place) => readDoc(root, place), { concurrency: 8 });

const RECEIPT = /^(?:\s+`[^`\n]+`(?:,\s+`[^`\n]+`)*)?\s+(?:at\s+`[0-9a-f]{7,40}`|deleted\b)/;

export interface DocLine {
  readonly doc: string;
  readonly line: number;
  readonly files: ReadonlyArray<string>;
  readonly text: string;
}

export const docLines = (docs: ReadonlyArray<Doc>, changed: ReadonlySet<string>) =>
  Effect.map(Path.Path, (path): ReadonlyArray<DocLine> =>
    docs.flatMap((doc) => {
      const lines = doc.text.split('\n');
      const named = new Map<number, Set<string>>();
      for (const anchor of anchorsIn(doc).filter((a) => !a.receipt)) {
        const { froms, written } = Bool.match(anchor.link, {
          onTrue: () => ({
            froms: [path.join(path.dirname(doc.path), anchor.path)],
            written: `](${anchor.written}`,
          }),
          onFalse: () => ({
            froms: doc.bases.map((base) => path.join(base, anchor.path)),
            written: `\`${anchor.written}\``,
          }),
        });
        const files = froms.filter((file) => changed.has(file));
        if (files.length === 0) continue;
        lines.forEach((text, i) => {
          if (!text.includes(written) || ANOTHER_REPO.test(text)) return;
          if (RECEIPT.test(text.slice(text.indexOf(written) + written.length))) return;
          const on = named.get(i) ?? new Set<string>();
          for (const file of files) on.add(file);
          named.set(i, on);
        });
      }
      return Array.from(named, ([i, files]) => ({
        doc: doc.path,
        line: i + 1,
        files: Array.from(files).sort(),
        text: lines[i]?.trim() ?? '',
      })).sort((a, b) => a.line - b.line);
    }),
  );
