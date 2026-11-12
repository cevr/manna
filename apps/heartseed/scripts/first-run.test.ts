/* oxlint-disable effect/noNodeBuiltinImport -- the test reads verify-heartseed's feature files from disk, synchronously, as `probe-lines.test.ts` does. */

/**
 * A fresh install opens on the welcome (`Heartseed`, with `Begin` and
 * `Skip`), and so does every launch while the garden holds no recall, a
 * relaunch mid-way through the first minute among them: only the welcome's
 * `Skip`, or `Begin` then `Plant your first verse`, shows `Hear it`. So in
 * verify-heartseed's `SKILL.md` and `features/*.md`, a `sim open … --expect
 * "label=<heading>"` for a heading of the first minute's verse (`Hear it`,
 * `Say it with help`, `Say it alone`, `Planted`) carries `--no-relaunch`: it
 * waits in the launch already showing that phase, after a tap reached it.
 * Without it, the open's retry relaunches the app, which shows the welcome,
 * never that heading. A command is read from `sim open` to the end of its
 * inline code, white space folded, so one wrapped over two lines is one.
 * The rule reads the commands only; it does not judge the steps around them.
 */

import { describe, expect, it } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const SKILL = join(import.meta.dir, '../../../.claude/skills/verify-heartseed');

/** The headings of the first minute's verse, each shown only after the welcome in its launch. */
const PHASES = ['Hear it', 'Say it with help', 'Say it alone', 'Planted'];

const OPEN = /sim open [^`]*/gu;

/** The faults of `text`, the file `file`: each `sim open` that waits for a phase's heading through a relaunch. */
const firstRunFaults = (file: string, text: string): readonly string[] =>
  [...text.replace(/\s+/gu, ' ').matchAll(OPEN)].flatMap((match) => {
    const command = match[0].trim();
    if (command.includes('--no-relaunch')) return [];
    return PHASES.filter((each) => command.includes(`--expect "label=${each}"`)).map(
      (heading) =>
        `${file}: \`${command}\` waits for ${heading} through a relaunch, which shows the welcome`,
    );
  });

describe('verify-heartseed’s first-run steps', () => {
  it('fault an open that waits for a first-minute heading without --no-relaunch, wrapped or not, and pass one with it', () => {
    expect(
      firstRunFaults(
        'a.md',
        [
          'Fresh: `sim open / --expect "label=Hear it"`, then',
          '`sim open /',
          '--expect "label=Say it alone"` and `sim open / --expect "label=Planted" --timeout 5`.',
          'Then `sim tap "label=Skip"`, `sim open / --expect "label=Hear it" --no-relaunch`,',
          '`sim open / --expect "label=Begin"` and `sim open / --expect "label=Hear it soon"`.',
        ].join('\n'),
      ),
    ).toEqual([
      'a.md: `sim open / --expect "label=Hear it"` waits for Hear it through a relaunch, which shows the welcome',
      'a.md: `sim open / --expect "label=Say it alone"` waits for Say it alone through a relaunch, which shows the welcome',
      'a.md: `sim open / --expect "label=Planted" --timeout 5` waits for Planted through a relaunch, which shows the welcome',
    ]);
  });

  it('no feature file or SKILL.md waits for a first-minute heading through a relaunch', () => {
    const files = [
      'SKILL.md',
      ...readdirSync(join(SKILL, 'features'))
        .filter((file) => file.endsWith('.md'))
        .map((file) => `features/${file}`),
    ];
    expect(files.length).toBeGreaterThan(20);
    expect(
      files.flatMap((file) => firstRunFaults(file, readFileSync(join(SKILL, file), 'utf8'))),
    ).toEqual([]);
  });
});
