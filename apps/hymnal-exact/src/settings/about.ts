/**
 * Settings → About: who made the sounds the recordings are played on, as
 * their licences ask: the current hymnal's own `RECORDING_CREDITS`, each
 * line with its licence's address where it has one ("" where it has none).
 */

import { type CreditLine, RECORDING_CREDITS } from '@manna/hymnal/recordings';

/** One credit as About draws it. */
export interface AboutCredit {
  readonly part: string;
  readonly work: string;
  readonly author: string;
  readonly licence: string;
  readonly url: string;
}

/** About's page: the lead, then a line per sound (a list Exact's generated types read as mutable). */
export interface AboutPage {
  readonly lead: string;
  readonly credits: Array<AboutCredit>;
}

const lines: ReadonlyArray<CreditLine> = RECORDING_CREDITS.lines;

export const aboutPage = (): AboutPage => ({
  lead: RECORDING_CREDITS.lead,
  credits: lines.map((line) => ({
    part: line.part,
    work: line.work,
    author: line.author,
    licence: line.licence,
    url: line.licenceUrl ?? '',
  })),
});
