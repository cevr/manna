/* oxlint-disable effect/noTernary, effect/noNullish, effect/noTryCatch -- the port's source folder imports no effect (docs/exact.md): a malformed escape is `decodeURIComponent`'s throw, read as a segment that is `undefined`. */

/**
 * The one rule a host serves the built site by (`bun run build:web` writes
 * it to `dist/`; README.md, "The web"). Every address a screen has is a
 * page file (`pagesOf`): `/` is `index.html`, `/hymns/100` is
 * `hymns/100/index.html`. A request's path is decoded segment by segment;
 * it is served as the file it names, else as that folder's `index.html`,
 * with status 200. Anything else is `404.html` with status 404, the same
 * shell, whose script draws the not-found screen: a path that ends in `/` (but `/`), an
 * empty, `.` or `..` segment, a segment that names a dot file or decodes
 * to a separator or a NUL, a malformed escape, and a path with no file.
 * So a public file (no segment starting with `.`) is always served as
 * itself, and nothing outside `files`, the build's own, is ever named.
 */

export interface Served {
  /** The build's file sent, relative to its folder. */
  readonly file: string;
  readonly status: 200 | 404;
}

export const NOT_FOUND: Served = { file: '404.html', status: 404 };

/** Whether `file`, relative to the build's folder, is one a host serves: no segment of it starts with `.`. */
export const isPublic = (file: string): boolean =>
  file.split('/').every((segment) => segment !== '' && !segment.startsWith('.'));

/** The segment `raw` decodes to, or undefined when it is malformed or could leave its folder. */
const segmentOf = (raw: string): string | undefined => {
  let text: string;
  try {
    text = decodeURIComponent(raw);
  } catch {
    return undefined;
  }
  if (text === '' || text.startsWith('.') || /[/\\\0]/u.test(text)) return undefined;
  return text;
};

/** What a host sends for a request's `pathname` (no query or fragment) from a build holding `files`. */
export const servedFor = (files: ReadonlySet<string>, pathname: string): Served => {
  if (pathname === '/')
    return files.has('index.html') ? { file: 'index.html', status: 200 } : NOT_FOUND;
  if (!pathname.startsWith('/')) return NOT_FOUND;
  const segments = pathname.slice(1).split('/').map(segmentOf);
  if (segments.some((segment) => segment === undefined)) return NOT_FOUND;
  const file = segments.join('/');
  if (files.has(file)) return { file, status: 200 };
  if (files.has(`${file}/index.html`)) return { file: `${file}/index.html`, status: 200 };
  return NOT_FOUND;
};
