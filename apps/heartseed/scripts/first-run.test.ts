/* oxlint-disable effect/noNodeBuiltinImport -- the test reads verify-heartseed's feature files from disk, synchronously, as `probe-lines.test.ts` does. */

/**
 * A fresh install opens on the welcome (`Heartseed`, with `Begin` and
 * `Skip`), and so does every launch while the garden holds no recall: only
 * the welcome's `Skip`, or `Begin` then `Plant your first verse`, shows
 * `Hear it`. So verify-heartseed's `SKILL.md` and `features/*.md` are read
 * as steps, in order, section by section (a `#` heading starts one), from
 * the commands in their inline code and their fenced blocks and the word
 * `uninstall` in their prose:
 *
 * - an uninstall or a `sim install` empties the garden; a `sim relaunch`,
 *   an `xcrun simctl terminate` or a `sim open` without `--no-relaunch` is
 *   a launch, which on an empty garden opens the welcome;
 * - a wait for `Begin` (an open's `--expect` or a tap) shows the welcome,
 *   and its `Skip` or its `Plant your first verse` leaves it;
 * - a wait for `Planted` or for home (`Your field`, `Settings`,
 *   `id=today-card`, `id=tip-1`) means the garden holds a recall.
 *
 * A wait for a heading of the first minute's verse (`Hear it`,
 * `Say it with help`, `Say it alone`, `Planted`) on an empty garden after a
 * launch the welcome has not been left in is a fault, and so is a `sim
 * open` that waits for one without `--no-relaunch`, whose retry relaunches
 * the app. A section whose garden is not known (no uninstall or install
 * read in it yet) is judged by the second rule alone.
 */

import { describe, expect, it } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const SKILL = join(import.meta.dir, '../../../.claude/skills/verify-heartseed');

/** The headings of the first minute's verse, each shown only after the welcome in its launch. */
const PHASES = ['Hear it', 'Say it with help', 'Say it alone', 'Planted'];

/** The targets that show home, so a garden that holds a recall. */
const HOME = ['label=Your field', 'label=Settings', 'id=today-card', 'id=tip-1'];

/** A step: a command in inline code, or the word `uninstall` in prose. */
const STEP = /`(?:sim|xcrun simctl) [^`]*`|\buninstall/giu;

/** The garden as the steps so far leave it, and whether the shown launch is past the welcome. */
interface Drive {
  readonly garden: 'unknown' | 'empty' | 'recall';
  readonly screen: 'other' | 'fresh' | 'welcome' | 'past';
}

const START: Drive = { garden: 'unknown', screen: 'other' };

/** `text` with each line of a fenced block in inline code, so its commands read as steps. */
const inlined = (text: string) =>
  text.replace(/```[^\n]*\n([\s\S]*?)```/gu, (_, body: string) =>
    body
      .split('\n')
      .map((line) => `\`${line.trim()}\``)
      .join('\n'),
  );

const expects = (command: string, target: string) =>
  command.includes(`--expect "${target}"`) ||
  (command.startsWith('sim tap') && command.includes(`"${target}"`));

/** The screen a launch shows, by the garden it reads. */
const LAUNCHED = { unknown: 'other', empty: 'fresh', recall: 'other' } as const;

const relaunches = (command: string) =>
  command.startsWith('sim open') && !command.includes('--no-relaunch');

/** The drive after `command`'s launch and taps, before what it waits for is judged. */
const before = (drive: Drive, command: string): Drive => {
  const launched = /^sim relaunch|simctl terminate/u.test(command) || relaunches(command);
  let shown = drive;
  if (/^uninstall$|simctl uninstall|^sim install/iu.test(command))
    shown = { garden: 'empty', screen: 'fresh' };
  else if (launched) shown = { garden: drive.garden, screen: LAUNCHED[drive.garden] };
  if (expects(command, 'label=Begin')) return { garden: shown.garden, screen: 'welcome' };
  const leaves = expects(command, 'label=Skip') || expects(command, 'label=Plant your first verse');
  if (shown.screen === 'welcome' && leaves) return { garden: shown.garden, screen: 'past' };
  return shown;
};

/** The drive after `command` has shown what it waits for. */
const after = (drive: Drive, command: string): Drive => {
  if (expects(command, 'label=Planted') || HOME.some((target) => expects(command, target)))
    return { garden: 'recall', screen: 'other' };
  return drive;
};

/** The faults of `command`'s waits for a first-minute heading in `drive`. */
const waitFaults = (file: string, drive: Drive, command: string): readonly string[] =>
  PHASES.filter((each) => expects(command, `label=${each}`)).flatMap((heading) => {
    if (relaunches(command))
      return [
        `${file}: \`${command}\` waits for ${heading} through a relaunch, which shows the welcome`,
      ];
    if (drive.screen === 'fresh' || drive.screen === 'welcome')
      return [
        `${file}: \`${command}\` waits for ${heading} on an empty garden before the welcome's Skip`,
      ];
    return [];
  });

/** The faults of one section's steps. */
const sectionFaults = (file: string, section: string): readonly string[] => {
  const faults: string[] = [];
  let drive = START;
  for (const match of section.replace(/\s+/gu, ' ').matchAll(STEP)) {
    const command = match[0].replaceAll('`', '').trim();
    drive = before(drive, command);
    faults.push(...waitFaults(file, drive, command));
    drive = after(drive, command);
  }
  return faults;
};

/** The faults of `text`, the file `file`. */
const firstRunFaults = (file: string, text: string): readonly string[] =>
  inlined(text)
    .split(/^#{1,6} /mu)
    .flatMap((section) => sectionFaults(file, section));

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

  it('fault a wait for a first-minute heading after an uninstall, an install or a relaunch on an empty garden that skips the welcome, and pass each way through it', () => {
    const open = '`sim open / --expect "label=Hear it" --no-relaunch`';
    const cases = {
      prose: `A fresh container (uninstall by udid, install, revoke), then ${open}.`,
      install: `\`sim install\`, then ${open}.`,
      relaunch: `Uninstall; \`sim open / --expect "label=Begin"\`, \`sim tap "label=Skip"\`, ${open}; \`sim relaunch\`; ${open}.`,
      terminate: `Uninstall; \`sim open / --expect "label=Begin"\`, \`sim tap "label=Skip"\`; \`xcrun simctl terminate <udid> app.heartseed\`; \`sim tap "label=Say it with help" --timeout 30\`.`,
      'begin only': `Uninstall; \`sim open / --expect "label=Begin"\`, ${open}.`,
      fenced:
        '```bash\nxcrun simctl uninstall <udid> app.heartseed\nsim open / --expect "label=Hear it" --no-relaunch\n```',
      skip: `Uninstall; \`sim open / --expect "label=Begin"\`, \`sim tap "label=Skip"\`, ${open}.`,
      plant: `\`sim install\`; \`sim tap "label=Begin"\`, \`sim tap "label=Plant your first verse"\`, ${open}.`,
      recall: `Uninstall; \`sim open / --expect "label=Begin"\`, \`sim tap "label=Skip"\`; \`sim tap "label=Planted" --timeout 30\`; \`sim relaunch\`, \`sim open / --expect "id=today-card"\`.`,
      'unknown garden': `\`sim relaunch\`, ${open}.`,
      'new section': `Uninstall.\n\n## Next\n\n${open}.`,
    };
    expect(
      Object.fromEntries(
        Object.entries(cases).map(([name, text]) => [name, firstRunFaults('a.md', text).length]),
      ),
    ).toEqual({
      prose: 1,
      install: 1,
      relaunch: 1,
      terminate: 1,
      'begin only': 1,
      fenced: 1,
      skip: 0,
      plant: 0,
      recall: 0,
      'unknown garden': 0,
      'new section': 0,
    });
  });

  it('fault natural.md’s today-mirror with its welcome steps taken out', () => {
    const text = readFileSync(join(SKILL, 'features/natural.md'), 'utf8');
    const welcome =
      '`sim open / --expect "label=Begin"` (the welcome a fresh\ninstall opens on), `sim tap "label=Skip"`, ';
    expect(text.includes(welcome)).toBe(true);
    expect(firstRunFaults('features/natural.md', text.replace(welcome, ''))).toEqual([
      'features/natural.md: `sim open / --expect "label=Hear it" --no-relaunch` waits for Hear it on an empty garden before the welcome\'s Skip',
    ]);
  });

  it('no feature file or SKILL.md waits for a first-minute heading where the welcome shows', () => {
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
