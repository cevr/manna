import { type Places, pageHref } from '../../core/api.ts';

export const PLACE_HREFS = {
  ask: pageHref.ask('a0123456789'),
  askPage: pageHref.askPage('a0123456782'),
} satisfies Record<Exclude<keyof typeof Places, 'export' | 'home'>, string>;
