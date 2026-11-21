/**
 * About's links open what the current hymnal's open: One's `Credit` hands
 * `Linking.openURL` the line's `licenceUrl`, and About's Contract draws the
 * licence as a link to the credit's `url`, which `aboutPage` answers from
 * that same `licenceUrl` (`sources.test.ts`). The Gemma notice and the
 * Terms are the current hymnal's own (`GEMMA_NOTICE`, `gemmaTerms`), drawn
 * in One's order with its two links to their addresses. That each link is
 * drawn as one, on each host, is `tools/drive-about.ts`'s.
 */

import { expect, it } from 'bun:test';
import { GEMMA_NOTICE } from '@manna/hymnal-app/gemma-notice';
import { gemmaTerms } from '@manna/hymnal-app/meaning/gemma-terms';
import { type CreditLine, RECORDING_CREDITS } from '@manna/hymnal/recordings';

import { appFile, oneFile } from '../look/design.testing.ts';
import { aboutPage } from './about.ts';

const lines: ReadonlyArray<CreditLine> = RECORDING_CREDITS.lines;

const linkLines = (text: string) => text.split('\n').filter((line) => line.includes('href='));

it("links each licence to the address the current hymnal's Credit opens", () => {
  const one = oneFile('src/about.tsx');
  expect(one).toContain('Option.fromUndefinedOr(line.licenceUrl)');
  expect(one).toContain('onPress={() => void Linking.openURL(url)}');
  expect(linkLines(appFile('features/about.contract')).map((line) => line.trim())).toEqual([
    'text c.licence href=c.url color="accent" testId=`about-licence-${c.part}`',
    'text page.gemma.terms href=page.gemma.termsUrl color="accent" testId="gemma-notice-terms"',
    'text page.gemma.policy href=page.gemma.policyUrl color="accent" testId="gemma-notice-policy"',
  ]);
  expect(aboutPage().credits.map((credit) => credit.url)).toEqual(
    lines.map((line) => line.licenceUrl ?? ''),
  );
});

it("answers the current hymnal's Gemma notice and Terms, drawn in its order", () => {
  expect(aboutPage().gemma).toEqual({ ...GEMMA_NOTICE, termsText: gemmaTerms });
  const one = oneFile('src/about.tsx');
  const order = ['lead', 'termsUrl', 'terms', 'between', 'policyUrl', 'policy', 'end'];
  const at = order.map((name) => one.indexOf(`GEMMA_NOTICE.${name}`));
  expect(at.every((k) => k > 0)).toBe(true);
  expect(at.toSorted((a, b) => a - b)).toEqual(at);
  const drawn = appFile('features/about.contract')
    .split('\n')
    .flatMap((line) => line.match(/page\.gemma\.(\w+)/g) ?? []);
  expect(drawn).toEqual([
    'page.gemma.lead',
    'page.gemma.terms',
    'page.gemma.termsUrl',
    'page.gemma.between',
    'page.gemma.policy',
    'page.gemma.policyUrl',
    'page.gemma.end',
    'page.gemma.termsButton',
    'page.gemma.termsButton',
    'page.gemma.termsText',
  ]);
  expect(one).toContain('{GEMMA_NOTICE.termsButton}');
  expect(one).toContain('{gemmaTerms}');
});
