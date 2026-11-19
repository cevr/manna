/**
 * Settings → About: who made the sounds the recordings are played on, as
 * their licences ask: the current hymnal's own `RECORDING_CREDITS`, each
 * line in its own words (`creditHead`, `CREDIT_END`) with its licence's
 * address where it has one ("" where it has none).
 */

import { CREDIT_END, creditHead } from '@manna/hymnal-app/credit';
import { type CreditLine, RECORDING_CREDITS } from '@manna/hymnal/recordings';

/** One credit as About draws it: its part (its key), the words run on to its licence, the licence and its address. */
export interface AboutCredit {
  readonly part: string;
  readonly head: string;
  readonly licence: string;
  readonly url: string;
}

/** About's page: the lead, a line per sound (a list Exact's generated types read as mutable), and what ends each line. */
export interface AboutPage {
  readonly lead: string;
  readonly credits: Array<AboutCredit>;
  readonly end: string;
}

const lines: ReadonlyArray<CreditLine> = RECORDING_CREDITS.lines;

export const aboutPage = (): AboutPage => ({
  lead: RECORDING_CREDITS.lead,
  credits: lines.map((line) => ({
    part: line.part,
    head: creditHead(line),
    licence: line.licence,
    url: line.licenceUrl ?? '',
  })),
  end: CREDIT_END,
});
