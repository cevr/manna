// Every place a lab page is at (`Places`, `core/api.ts`), by a link the
// lab serves it at: the pages' server tests (the CSS budget, the pure
// render) walk them all, so a place added there is walked, or this fails to
// typecheck. A film's export page is no phone's: the renderer's and the
// easel's, drawn in the browser alone, with no server render. Home is no
// page: the lab sends it on to an ask (`tools/lab-home.ts`).

import { type Places, pageHref } from '../../core/api.ts';

export const PLACE_HREFS = {
  ask: pageHref.ask('a0123456789'),
  askPage: pageHref.askPage('a0123456782'),
} satisfies Record<Exclude<keyof typeof Places, 'export' | 'home'>, string>;
