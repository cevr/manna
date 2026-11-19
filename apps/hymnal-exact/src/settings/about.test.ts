/**
 * About's licence link opens what the current hymnal's opens: One's
 * `Credit` hands `Linking.openURL` the line's `licenceUrl`, and About's
 * Contract draws the licence as a link to the credit's `url`, which
 * `aboutPage` answers from that same `licenceUrl` (`sources.test.ts`). That
 * the link is drawn as one, on each host, is `tools/drive-about.ts`'s.
 */

import { expect, it } from 'bun:test';
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
  ]);
  expect(aboutPage().credits.map((credit) => credit.url)).toEqual(
    lines.map((line) => line.licenceUrl ?? ''),
  );
});
