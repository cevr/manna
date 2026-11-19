/**
 * Settings' sources as Exact's data module runs them (under `withDataHost`,
 * so what Hermes lacks fails here): the Appearance rows answer any kept
 * text with one row chosen and every row but the first divided, and About answers the current hymnal's own
 * recording credits, each licence's address where it has one.
 */

import { describe, expect, it } from 'bun:test';

import { withDataHost } from '@manna/exact-kit/data-host/testing';
import { CREDIT_END, creditHead } from '@manna/hymnal-app/credit';
import { type CreditLine, RECORDING_CREDITS } from '@manna/hymnal/recordings';

import { sourcesAt } from '../sources.ts';
import { below, pick, seeded } from '../test/random.ts';

const sources = sourcesAt('https://hymns.cvr.im', []);
const lines: ReadonlyArray<CreditLine> = RECORDING_CREDITS.lines;

describe('Settings’ sources', () => {
  it('answer the Appearance rows for any kept text, one chosen', () => {
    const random = seeded(11);
    withDataHost(() => {
      for (let run = 0; run < 300; run++) {
        const kept = pick(random, ['system', 'light', 'dark', '', 'x', `${below(random, 9)}`]);
        const rows = sources.settingsLooks([kept]);
        expect(rows.map((row) => row.label)).toEqual(['System', 'Light', 'Dark']);
        expect(rows.filter((row) => row.chosen)).toHaveLength(1);
        expect(rows).toEqual(
          rows.map((_, k) => ({
            value: expect.any(String),
            label: expect.any(String),
            chosen: expect.any(Boolean),
            divided: k > 0,
          })),
        );
      }
    });
  });

  it('answer About with the current hymnal’s credits', () => {
    const page = withDataHost(() => sources.aboutCredits());
    expect(page.lead).toBe(RECORDING_CREDITS.lead);
    expect(page.credits).toEqual(
      lines.map((line) => ({
        part: line.part,
        head: creditHead(line),
        licence: line.licence,
        url: line.licenceUrl ?? '',
      })),
    );
    expect(page.end).toBe(CREDIT_END);
    expect(page.credits.filter((credit) => credit.url.startsWith('https://'))).toHaveLength(
      lines.filter((line) => 'licenceUrl' in line).length,
    );
  });
});
