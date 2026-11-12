/* oxlint-disable effect/noNodeBuiltinImport, effect/noNullish, effect/noTernary -- the test reads verify-heartseed's feature files from disk, synchronously, as `probe-lines.test.ts` does, and reads a command's shell words with regular expressions, whose absent matches are null, picking each field with a plain branch. */

/**
 * A fresh install opens on the welcome (`Heartseed`, with `Begin` and
 * `Skip`), and so does every launch while the garden holds no recall: only
 * the welcome's `Skip`, or `Begin` then `Plant your first verse`, shows
 * `Hear it`. So verify-heartseed's `SKILL.md` and `features/*.md` are read
 * as steps, in order, section by section (a `#` heading starts one), from
 * the commands in their inline code and their fenced blocks (a line ending
 * in `\` joined to the next) and the word `uninstall` in their prose. A
 * command starts at `sim`, however it is reached (alone, after
 * `bun run --cwd apps/heartseed`, a lock or an env, or as the helper's file
 * `…scripts/sim.ts`), or at `xcrun simctl`, several to a span when chained;
 * it is read by its shell words, a target quoted, single-quoted, escaped,
 * joined to its flag by `=` or bare (a bare word is a label):
 *
 * - an uninstall or a `sim install` empties the garden; a `sim relaunch`,
 *   an `xcrun simctl terminate`, an `xcrun simctl launch` of
 *   `app.heartseed` or a `sim open` without `--no-relaunch` is a launch,
 *   which on an empty garden opens the welcome;
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

/** A step's place: inline code, or the word `uninstall` in prose. */
const SPAN = /`([^`]*)`|\buninstall/giu;

/**
 * Where a command starts inside a span: `sim` alone or after
 * `bun run --cwd apps/heartseed` (or a lock, an env), the helper's file
 * `…scripts/sim.ts`, or `xcrun simctl`, each at the span's start or after
 * white space or a shell separator.
 */
const INVOKE = /(?<=^|[\s;&|(])(?:\S*scripts\/sim\.ts|sim|xcrun simctl)(?= )/gu;

/** One command, read: its tool, its verb, its first positional argument and its flags. */
interface Command {
  readonly text: string;
  readonly tool: 'sim' | 'simctl' | 'prose';
  readonly verb: string;
  readonly target: string;
  readonly expect: string;
  readonly noRelaunch: boolean;
}

/** A target as the helper takes it: unquoted, and a bare word a label. */
const targetOf = (raw: string) => {
  if (raw === '' || raw.includes('=')) return raw;
  return `label=${raw}`;
};

/** `text`, one command from `sim`, `…scripts/sim.ts` or `xcrun simctl` on, read by its words, quotes kept together. */
const commandOf = (text: string): Command => {
  const normal = text.replace(/^\S*scripts\/sim\.ts/u, 'sim').replace(/[;&|\s]+$/u, '');
  const words = Array.from(normal.matchAll(/(?:"[^"]*"|'[^']*'|\\.|[^\s"'\\])+/gu), ([word]) =>
    word.replace(/"([^"]*)"|'([^']*)'|\\(.)/gu, '$1$2$3'),
  ).flatMap((word) => {
    const joined = /^(--[a-z-]+)=(.*)$/u.exec(word);
    if (joined === null) return [word];
    return [joined[1] ?? '', joined[2] ?? ''];
  });
  const tool = normal.startsWith('xcrun') ? 'simctl' : 'sim';
  const rest = words.slice(tool === 'simctl' ? 2 : 1);
  const flagged = new Set(
    rest.flatMap((word, index) => (word === '--expect' || word === '--timeout' ? [index + 1] : [])),
  );
  const positional = rest
    .slice(1)
    .filter((word, index) => !word.startsWith('--') && !flagged.has(index + 1));
  const expectAt = rest.indexOf('--expect');
  return {
    text: normal,
    tool,
    verb: rest[0] ?? '',
    target: targetOf(positional[0] ?? ''),
    expect: expectAt < 0 ? '' : targetOf(rest[expectAt + 1] ?? ''),
    noRelaunch: rest.includes('--no-relaunch'),
  };
};

/** The commands of one span, in order; the word `uninstall` in prose is one. */
const commandsOf = (span: RegExpExecArray | RegExpMatchArray): readonly Command[] => {
  const code = span[1];
  if (code === undefined)
    return [
      {
        text: 'uninstall',
        tool: 'prose',
        verb: 'uninstall',
        target: '',
        expect: '',
        noRelaunch: false,
      },
    ];
  const starts = Array.from(code.matchAll(INVOKE), (start) => start.index);
  return starts.map((start, index) => commandOf(code.slice(start, starts[index + 1]).trim()));
};

/** The garden as the steps so far leave it, and whether the shown launch is past the welcome. */
interface Drive {
  readonly garden: 'unknown' | 'empty' | 'recall';
  readonly screen: 'other' | 'fresh' | 'welcome' | 'past';
}

const START: Drive = { garden: 'unknown', screen: 'other' };

/** `text` with each line of a fenced block in inline code, a line continued by `\` joined to the next, so its commands read as steps. */
const inlined = (text: string) =>
  text.replace(/```[^\n]*\n([\s\S]*?)```/gu, (_, body: string) =>
    body
      .replace(/\\\n\s*/gu, ' ')
      .split('\n')
      .map((line) => `\`${line.trim()}\``)
      .join('\n'),
  );

/** Whether `command` waits for `target`: an `--expect`, or a tap's target. */
const expects = (command: Command, target: string) =>
  command.tool === 'sim' &&
  (command.expect === target || (command.verb === 'tap' && command.target === target));

/** The screen a launch shows, by the garden it reads. */
const LAUNCHED = { unknown: 'other', empty: 'fresh', recall: 'other' } as const;

const relaunches = (command: Command) =>
  command.tool === 'sim' && command.verb === 'open' && !command.noRelaunch;

const empties = (command: Command) =>
  command.verb === 'uninstall' || (command.tool === 'sim' && command.verb === 'install');

const launches = (command: Command) =>
  relaunches(command) ||
  (command.tool === 'sim' && command.verb === 'relaunch') ||
  (command.tool === 'simctl' && command.verb === 'terminate') ||
  (command.tool === 'simctl' &&
    command.verb === 'launch' &&
    command.text.includes('app.heartseed'));

/** The drive after `command`'s launch and taps, before what it waits for is judged. */
const before = (drive: Drive, command: Command): Drive => {
  let shown = drive;
  if (empties(command)) shown = { garden: 'empty', screen: 'fresh' };
  else if (launches(command)) shown = { garden: drive.garden, screen: LAUNCHED[drive.garden] };
  if (expects(command, 'label=Begin')) return { garden: shown.garden, screen: 'welcome' };
  const leaves = expects(command, 'label=Skip') || expects(command, 'label=Plant your first verse');
  if (shown.screen === 'welcome' && leaves) return { garden: shown.garden, screen: 'past' };
  return shown;
};

/** The drive after `command` has shown what it waits for. */
const after = (drive: Drive, command: Command): Drive => {
  if (expects(command, 'label=Planted') || HOME.some((target) => expects(command, target)))
    return { garden: 'recall', screen: 'other' };
  return drive;
};

/** The faults of `command`'s waits for a first-minute heading in `drive`. */
const waitFaults = (file: string, drive: Drive, command: Command): readonly string[] =>
  PHASES.filter((each) => expects(command, `label=${each}`)).flatMap((heading) => {
    if (relaunches(command))
      return [
        `${file}: \`${command.text}\` waits for ${heading} through a relaunch, which shows the welcome`,
      ];
    if (drive.screen === 'fresh' || drive.screen === 'welcome')
      return [
        `${file}: \`${command.text}\` waits for ${heading} on an empty garden before the welcome's Skip`,
      ];
    return [];
  });

/** The faults of one section's steps. */
const sectionFaults = (file: string, section: string): readonly string[] => {
  const faults: string[] = [];
  let drive = START;
  for (const span of section.replace(/\s+/gu, ' ').matchAll(SPAN))
    for (const command of commandsOf(span)) {
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

  it('read a command however a step invokes it: in full through bun run, by the helper’s file, chained, continued over fenced lines, its target quoted, single-quoted or bare', () => {
    const cases = {
      'full form inline': '`bun run --cwd apps/heartseed sim open / --expect "label=Hear it"`',
      'full form fenced':
        '```bash\nbun run --cwd apps/heartseed sim open / --expect "label=Say it alone"\n```',
      'locked full form':
        '`lockf -k /tmp/manna-sim-hs.lock bun run --cwd apps/heartseed sim open / --expect "label=Planted"`',
      'helper file': '`bun apps/heartseed/scripts/sim.ts open / --expect "label=Hear it"`',
      'continued fenced':
        '```bash\nbun run --cwd apps/heartseed sim open / \\\n  --expect "label=Hear it"\n```',
      'single quotes': "`sim open / --expect 'label=Hear it'`",
      'bare target': '`sim open / --expect Hear\\ it`',
      'joined flag': '`sim open / --expect="label=Say it with help"`',
      'chained after uninstall':
        '`xcrun simctl uninstall <udid> app.heartseed && bun run --cwd apps/heartseed sim open / --expect "label=Hear it" --no-relaunch`',
      'bare tap after launch':
        'Uninstall. `bun run --cwd apps/heartseed sim open / --expect label=Begin`, `sim tap Planted`.',
      'simctl launch':
        'Uninstall; `sim open / --expect "label=Begin"`, `sim tap Skip`; `xcrun simctl launch <udid> app.heartseed`; `sim tap "label=Say it alone"`.',
      'full form through the welcome':
        'Uninstall; `bun run --cwd apps/heartseed sim open / --expect "label=Begin"`, `bun run --cwd apps/heartseed sim tap Skip`, `bun run --cwd apps/heartseed sim open / --expect "label=Hear it" --no-relaunch`.',
      'another app launched':
        'Uninstall; `sim open / --expect "label=Begin"`, `sim tap Skip`; `xcrun simctl launch <udid> com.apple.Preferences`; `sim tap "label=Say it alone"`.',
    };
    expect(
      Object.fromEntries(
        Object.entries(cases).map(([name, text]) => [name, firstRunFaults('a.md', text).length]),
      ),
    ).toEqual({
      'full form inline': 1,
      'full form fenced': 1,
      'locked full form': 1,
      'helper file': 1,
      'continued fenced': 1,
      'single quotes': 1,
      'bare target': 1,
      'joined flag': 1,
      'chained after uninstall': 1,
      'bare tap after launch': 1,
      'simctl launch': 1,
      'full form through the welcome': 0,
      'another app launched': 0,
    });
  });

  it('fault SKILL.md’s launch step waiting for Hear it in its own full form', () => {
    const text = readFileSync(join(SKILL, 'SKILL.md'), 'utf8');
    const launch = 'bun run --cwd apps/heartseed sim open / --expect "label=Isaiah 41:10"';
    expect(text.includes(launch)).toBe(true);
    expect(
      firstRunFaults('SKILL.md', text.replace(launch, launch.replace('Isaiah 41:10', 'Hear it'))),
    ).toEqual([
      'SKILL.md: `sim open / --expect "label=Hear it"` waits for Hear it through a relaunch, which shows the welcome',
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
