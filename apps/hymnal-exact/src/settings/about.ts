/**
 * Settings → About: who made the sounds the recordings are played on, as
 * their licences ask: the current hymnal's own `RECORDING_CREDITS`, each
 * line in its own words (`creditHead`, `CREDIT_END`) with its licence's
 * address where it has one ("" where it has none); then the notice the
 * Gemma Terms of Use ask of the meaning table "More like this" is made
 * from (`GEMMA_NOTICE`), and the Terms themselves (`gemmaTerms`), shown on
 * a press.
 */

import { CREDIT_END, creditHead } from '@manna/hymnal-app/credit';
import { GEMMA_NOTICE } from '@manna/hymnal-app/gemma-notice';
import { gemmaTerms } from '@manna/hymnal-app/meaning/gemma-terms';
import { type CreditLine, RECORDING_CREDITS } from '@manna/hymnal/recordings';

/** One credit as About draws it: its part (its key), the words run on to its licence, the licence and its address. */
export interface AboutCredit {
  readonly part: string;
  readonly head: string;
  readonly licence: string;
  readonly url: string;
}

/** The Gemma notice's parts, its two links' words and addresses, the Terms button's label, and the Terms' text. */
export interface AboutGemma {
  readonly lead: string;
  readonly terms: string;
  readonly termsUrl: string;
  readonly between: string;
  readonly policy: string;
  readonly policyUrl: string;
  readonly end: string;
  readonly termsButton: string;
  readonly termsText: string;
}

/** About's page: the lead, a line per sound (a list Exact's generated types read as mutable), what ends each line, and the Gemma notice. */
export interface AboutPage {
  readonly lead: string;
  readonly credits: Array<AboutCredit>;
  readonly end: string;
  readonly gemma: AboutGemma;
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
  gemma: { ...GEMMA_NOTICE, termsText: gemmaTerms },
});
