import { absolute, DESCRIPTION, type Page } from './pages.ts';
import { PALETTE } from './palette.ts';
import { CHANNEL } from './site.ts';

const xmlEscape = (text: string) =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

export const lastModified = (page: Page): ReadonlyArray<string> => {
  if (page.view._tag !== 'Series') return [];
  return page.view.series.episodes
    .map((episode) => episode.published)
    .toSorted()
    .slice(-1);
};

const sitemapEntry = (page: Page) =>
  [
    `  <url><loc>${xmlEscape(absolute(page.path))}</loc>`,
    ...lastModified(page).map((day) => `<lastmod>${day}</lastmod>`),
    '</url>',
  ].join('');

export const sitemap = (pages: ReadonlyArray<Page>) =>
  [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...pages.filter((page) => page.listed).map(sitemapEntry),
    '</urlset>',
    '',
  ].join('\n');

export const llmsTxt = (pages: ReadonlyArray<Page>) =>
  [
    `# ${CHANNEL.name}`,
    '',
    `> ${DESCRIPTION}`,
    '',
    `The channel is on YouTube: ${CHANNEL.url}`,
    '',
    '## Pages',
    '',
    ...pages
      .filter((page) => page.listed)
      .map((page) => `- [${page.title}](${absolute(page.path)}): ${page.description}`),
    '',
  ].join('\n');

export const robots = () =>
  ['User-agent: *', 'Allow: /', '', `Sitemap: ${absolute('/sitemap.xml')}`, ''].join('\n');

export const THEME_COLOR = PALETTE.sky;

export const webManifest = () => ({
  name: CHANNEL.name,
  short_name: CHANNEL.name,
  start_url: '/',
  display: 'browser',
  background_color: PALETTE.paper,
  theme_color: THEME_COLOR,
  icons: [
    { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
  ],
});
