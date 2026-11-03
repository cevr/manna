import { MARK_4_28, SERIES, type Series } from './content.ts';
import { MAIL_PAGES } from './mail/paths.ts';
import { CHANNEL, ORIGIN } from './site.ts';

export type NoticeId = Exclude<keyof typeof MAIL_PAGES, 'confirm' | 'leave'>;

export type PageView =
  | { readonly _tag: 'Home' }
  | { readonly _tag: 'About' }
  | { readonly _tag: 'Series'; readonly series: Series }
  | { readonly _tag: 'Privacy' }
  | { readonly _tag: 'Notice'; readonly notice: NoticeId }
  | { readonly _tag: 'Confirm' }
  | { readonly _tag: 'Leave' }
  | { readonly _tag: 'NotFound' };

export interface Page {
  readonly path: string;
  readonly file: string;
  readonly title: string;
  readonly description: string;
  readonly image: string;
  readonly imageAlt: string;
  readonly listed: boolean;
  readonly view: PageView;
}

export const DESCRIPTION =
  'Short films and talks on what the Bible teaches, starting with the first things. A new channel on YouTube.';

const title = (name: string) => `${name} · ${CHANNEL.name}`;

const seriesPage = (series: Series): Page => ({
  path: `/series/${series.slug}`,
  file: `series/${series.slug}.html`,
  title: title(series.name),
  description: `${series.line} A series of ${series.form.toLowerCase()} from ${CHANNEL.name}.`,
  image: `/og/${series.id}.jpg`,
  imageAlt: `${series.name}, a series from ${CHANNEL.name}.`,
  listed: true,
  view: { _tag: 'Series', series },
});

export const NOTICE_TITLES: Readonly<Record<NoticeId, string>> = {
  check: 'Check your inbox',
  confirmed: 'You are on the list',
  expired: 'This link has run out',
  address: 'Check your email address',
  busy: 'Too many tries',
  left: 'You have left the list',
  badLink: 'This link does not work',
};

const HOME_CARD = {
  image: '/og/home.jpg',
  imageAlt: `${CHANNEL.name}: “${MARK_4_28.text}” ${MARK_4_28.ref}.`,
} as const;

const listPage = (path: string, name: string, view: PageView): Page => ({
  path,
  file: `${path.slice(1)}.html`,
  title: title(name),
  description: DESCRIPTION,
  ...HOME_CARD,
  listed: false,
  view,
});

const NOTICES: ReadonlyArray<NoticeId> = [
  'check',
  'confirmed',
  'expired',
  'address',
  'busy',
  'left',
  'badLink',
];

export const PRIVACY_PATH = '/privacy';

export const PAGES: ReadonlyArray<Page> = [
  {
    path: '/',
    file: 'index.html',
    title: CHANNEL.name,
    description: DESCRIPTION,
    image: '/og/home.jpg',
    imageAlt: `${CHANNEL.name}: “${MARK_4_28.text}” ${MARK_4_28.ref}.`,
    listed: true,
    view: { _tag: 'Home' },
  },
  {
    path: '/about',
    file: 'about.html',
    title: title('About'),
    description: `What ${CHANNEL.name} is, and where its name comes from.`,
    image: '/og/home.jpg',
    imageAlt: `${CHANNEL.name}: “${MARK_4_28.text}” ${MARK_4_28.ref}.`,
    listed: true,
    view: { _tag: 'About' },
  },
  ...SERIES.map(seriesPage),
  {
    path: PRIVACY_PATH,
    file: 'privacy.html',
    title: title('Privacy'),
    description: `What the ${CHANNEL.name} email list keeps about you, and how to leave it.`,
    ...HOME_CARD,
    listed: true,
    view: { _tag: 'Privacy' },
  },
  ...NOTICES.map((notice) =>
    listPage(MAIL_PAGES[notice], NOTICE_TITLES[notice], { _tag: 'Notice', notice }),
  ),
  listPage(MAIL_PAGES.confirm, 'Confirm your email', { _tag: 'Confirm' }),
  listPage(MAIL_PAGES.leave, 'Leave the list', { _tag: 'Leave' }),
  {
    path: '/404',
    file: '404.html',
    title: title('Page not found'),
    description: DESCRIPTION,
    image: '/og/home.jpg',
    imageAlt: `${CHANNEL.name}: “${MARK_4_28.text}” ${MARK_4_28.ref}.`,
    listed: false,
    view: { _tag: 'NotFound' },
  },
];

export const absolute = (path: string) => `${ORIGIN}${path}`;
