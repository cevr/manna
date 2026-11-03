import { CHANNEL } from '../site.ts';

export interface NavLink {
  readonly href: string;
  readonly label: string;
}

export const NAV: ReadonlyArray<NavLink> = [
  { href: '/#series', label: 'Series' },
  { href: '/about', label: 'About' },
];

export const SUBSCRIBE: NavLink = { href: CHANNEL.subscribe, label: 'Subscribe on YouTube' };

export const FOOTER_NAV_ID = 'site-links';
