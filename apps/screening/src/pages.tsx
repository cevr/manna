/**
 * The site's three pages, drawn from the films' manifests (`./manifest.ts`)
 * to whole HTML files at publish time: nothing hydrates, and no script runs
 * but the browser's own video player.
 *
 * - the index (`/`): every film with a published version, the most recently
 *   published first, each a card with its title, its newest version's poster
 *   and that version's date;
 * - a film's folder (`/<film>/`): its versions, newest first, each a card
 *   with its name, date and poster;
 * - one version (`/<film>/<version>/`): its video, played in place on a
 *   phone, and for the Board the kept panels below it in the film's order,
 *   each with its beat.
 *
 * Dark and calm, read on a phone first: 16 px gutters, every box as wide as
 * the screen at most, so nothing scrolls sideways. Every page asks not to be
 * indexed; the Worker says so in its headers too (`./respond.ts`).
 */
import { For, NoHydration, Show, renderToString } from '@solidjs/web';
import type { JSX } from '@solidjs/web';

import {
  type FilmManifest,
  indexOf,
  PATHS,
  type Version,
  VERSION_LABELS,
  versionsOf,
} from './manifest.ts';

/** The site's name, as the index and every page's title say it. */
export const SITE_NAME = 'Films';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `2026-10-25` as a card says it: `25 Oct 2026`. */
export const dayLabel = (day: string): string => {
  const [year, month, date] = day.split('-');
  return `${Number(date)} ${MONTHS[Number(month) - 1] ?? month} ${year}`;
};

const CSS = `
:root { color-scheme: dark; --bg: #131210; --card: #1c1a17; --line: #2c2924; --ink: #ece6da; --muted: #a39b8b; --accent: #d8b46a; }
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; }
main { max-width: 64rem; margin: 0 auto; padding: 20px 16px 48px; }
a { color: inherit; }
a:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; border-radius: 4px; }
.crumb { display: inline-block; margin-bottom: 12px; color: var(--muted); text-decoration: none; font-size: 0.9375rem; }
.crumb:hover { color: var(--ink); }
h1 { margin: 0 0 4px; font: 600 1.75rem/1.2 "New York", Georgia, ui-serif, serif; letter-spacing: 0.01em; }
h2 { margin: 32px 0 12px; font: 600 1.125rem/1.3 "New York", Georgia, ui-serif, serif; }
.sub { margin: 0 0 20px; color: var(--muted); }
.cards { display: grid; gap: 16px; grid-template-columns: repeat(auto-fill, minmax(min(100%, 18rem), 1fr)); margin: 0; padding: 0; list-style: none; }
.card { display: block; overflow: hidden; border: 1px solid var(--line); border-radius: 12px; background: var(--card); text-decoration: none; }
.card img { display: block; width: 100%; aspect-ratio: 16 / 9; object-fit: cover; background: #000; }
.card .meta { padding: 12px 14px 14px; }
.card .name { display: block; font-weight: 600; }
.card .date { display: block; color: var(--muted); font-size: 0.9375rem; }
video { display: block; width: 100%; max-height: 80vh; aspect-ratio: 16 / 9; border-radius: 12px; background: #000; }
.panels { display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(min(100%, 14rem), 1fr)); margin: 0; padding: 0; list-style: none; }
.panels figure { margin: 0; }
.panels img { display: block; width: 100%; height: auto; aspect-ratio: 3 / 2; object-fit: cover; border-radius: 8px; background: var(--card); }
.panels figcaption { padding-top: 6px; color: var(--muted); font-size: 0.875rem; }
.empty { color: var(--muted); }
`;

interface DocumentProps {
  readonly title: string;
  readonly children: JSX.Element;
}

const Document = (props: DocumentProps) => (
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      <meta name="robots" content="noindex, nofollow" />
      <meta name="theme-color" content="#131210" />
      <title>{props.title}</title>
      <style innerHTML={CSS} />
    </head>
    <body>
      <main>{props.children}</main>
    </body>
  </html>
);

/** A card linking to a page: its poster, its name and its date. */
const Card = (props: {
  readonly href: string;
  readonly name: string;
  readonly version: Version;
}) => (
  <li>
    <a class="card" href={props.href}>
      <img src={PATHS.asset(props.version.poster.key)} alt="" loading="lazy" decoding="async" />
      <span class="meta">
        <span class="name">{props.name}</span>
        <span class="date">
          {VERSION_LABELS[props.version.name]} · {dayLabel(props.version.day)}
        </span>
      </span>
    </a>
  </li>
);

const IndexPage = (props: { readonly films: ReadonlyArray<FilmManifest> }) => {
  const entries = indexOf(props.films);
  return (
    <Document title={SITE_NAME}>
      <h1>{SITE_NAME}</h1>
      <p class="sub">Drafts and finished films, as they are made.</p>
      <Show when={entries.length > 0} fallback={<p class="empty">Nothing is published yet.</p>}>
        <ul class="cards">
          <For each={entries}>
            {(entry) => (
              <Card
                href={PATHS.folder(entry.film.film)}
                name={entry.film.title}
                version={entry.newest}
              />
            )}
          </For>
        </ul>
      </Show>
    </Document>
  );
};

const FolderPage = (props: { readonly film: FilmManifest }) => (
  <Document title={`${props.film.title} · ${SITE_NAME}`}>
    <a class="crumb" href={PATHS.index}>
      ← {SITE_NAME}
    </a>
    <h1>{props.film.title}</h1>
    <p class="sub">Each version, newest first.</p>
    <ul class="cards">
      <For each={versionsOf(props.film)}>
        {(version) => (
          <Card
            href={PATHS.version(props.film.film, version.name)}
            name={VERSION_LABELS[version.name]}
            version={version}
          />
        )}
      </For>
    </ul>
  </Document>
);

const VersionPage = (props: { readonly film: FilmManifest; readonly version: Version }) => (
  <Document title={`${props.film.title} · ${VERSION_LABELS[props.version.name]}`}>
    <a class="crumb" href={PATHS.folder(props.film.film)}>
      ← {props.film.title}
    </a>
    <h1>{props.film.title}</h1>
    <p class="sub">
      {VERSION_LABELS[props.version.name]} · {dayLabel(props.version.day)}
    </p>
    <video controls playsinline preload="metadata" poster={PATHS.asset(props.version.poster.key)}>
      <source src={PATHS.asset(props.version.video.key)} type="video/mp4" />
    </video>
    <Show when={props.version.panels.length > 0}>
      <h2>The kept panels</h2>
      <ol class="panels">
        <For each={props.version.panels}>
          {(panel) => (
            <li>
              <figure>
                <img src={PATHS.asset(panel.image.key)} alt="" loading="lazy" decoding="async" />
                <figcaption>{panel.beat}</figcaption>
              </figure>
            </li>
          )}
        </For>
      </ol>
    </Show>
  </Document>
);

/** `view` drawn to a whole HTML document. */
const draw = (view: () => JSX.Element): string =>
  `<!doctype html>\n${renderToString(() => <NoHydration>{view()}</NoHydration>)}\n`;

/** The index over every film's manifest. */
export const indexPage = (films: ReadonlyArray<FilmManifest>): string =>
  draw(() => <IndexPage films={films} />);

/** `film`'s folder. */
export const folderPage = (film: FilmManifest): string => draw(() => <FolderPage film={film} />);

/** `film`'s `version`. */
export const versionPage = (film: FilmManifest, version: Version): string =>
  draw(() => <VersionPage film={film} version={version} />);
