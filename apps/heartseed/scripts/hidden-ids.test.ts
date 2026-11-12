/* oxlint-disable effect/noNodeBuiltinImport, effect/noNullish -- the test reads verify-heartseed's feature files from disk, synchronously, as `probe-lines.test.ts` does; an absent match is nullish. */

/**
 * A drive reads the simulator's accessibility tree, and a node hidden from
 * VoiceOver is not in it. So no step of verify-heartseed's `SKILL.md` or
 * `features/*.md` names a hidden node's id as one to find: neither
 * `id=<id>` nor, for a numbered family such as a line's `break-<k>`, a
 * number of it (`break-8`), nor, in a clause of prose outside fenced
 * blocks, the family's or the id's ids, nodes or elements (`the break
 * ids`, `the \`break-\` ids`) or a reading word before it (`reading the
 * breaks`), unless the clause says they are hidden, absent or none, or
 * says `no` before them. A row reads such a node from what
 * the tree does hold (the words' frames), or leaves it to the unit tests,
 * naming the family alone (`break-<k>`, `no break-`).
 *
 * The hidden ids come from the app's sources (`hiddenOfApp`,
 * `journey-rules.ts`, whose `hiddenFaults` holds the same rule over the
 * journeys' selectors). This reader of prose is a tripwire over the files'
 * words, never extended to a new phrasing.
 */

import { describe, expect, it } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { type Hidden, hiddenIn, hiddenOfApp } from './journey-rules.ts';

const APP = join(import.meta.dir, '..');
const SKILL = join(APP, '../../.claude/skills/verify-heartseed');

const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

/** The faults of `text`, the file `file`: each line naming a hidden id as a target or a numbered one of a hidden family. */
const namedFaults = (file: string, text: string, hidden: Hidden): readonly string[] => {
  const patterns = [
    ...[...hidden.ids].map((id) => new RegExp(`id=${escaped(id)}(?![\\w-])`, 'u')),
    ...[...hidden.families].map(
      (family) => new RegExp(`(?<![\\w-])${escaped(family)}\\d+(?![\\w-])`, 'u'),
    ),
  ];
  return text
    .split('\n')
    .flatMap((line, index) =>
      patterns
        .filter((pattern) => pattern.test(line))
        .map(
          (pattern) => `${file}:${index + 1}: ${pattern.exec(line)?.[0]} is hidden from VoiceOver`,
        ),
    );
};

/** The words that ask a drive to read what it names. */
const READS =
  'read|reads|reading|count|counts|counting|record|records|recording|report|reports|reporting|find|finds|finding|list|lists|listing|check|checks|checking';

/**
 * The patterns of a clause that asks for a hidden family's or id's nodes:
 * its ids, nodes or elements (`the break ids`, `the \`break-<k>\` ids`,
 * `the \`break-\` nodes`), or a reading word before it (`reading the
 * breaks`, `count the \`break-\``).
 */
const asks = (hidden: Hidden) =>
  [
    ...[...hidden.families].map(
      (family) => `${escaped(family.replace(/-$/u, ''))}(?:s|-(?:<\\w+>)?)?`,
    ),
    ...[...hidden.ids].map((id) => escaped(id)),
  ].map((stem) => ({
    patterns: [
      new RegExp(`(?<![\\w-])\`?${stem}\`?(?:'s)?\\s+(?:ids?|nodes?|elements?)\\b`, 'iu'),
      new RegExp(
        `\\b(?:${READS})\\s+(?:the\\s+|each\\s+|every\\s+|its\\s+)?\`?${stem}(?![\\w])`,
        'iu',
      ),
    ],
    saysHidden: new RegExp(
      `\\bhidden\\b|\\babsent\\b|\\bnone\\b|\\bno\\s+(?:other\\s+)?\`?${stem}`,
      'iu',
    ),
  }));

/** The faults of `text`, the file `file`: each clause, outside fenced blocks, that asks a drive for a hidden node and does not say it is hidden. */
const askFaults = (file: string, text: string, hidden: Hidden): readonly string[] => {
  const prose = text.replace(/```[\s\S]*?```/gu, (block) => block.replace(/[^\n]/gu, ' '));
  const flat = prose.replace(/\s/gu, ' ');
  const stems = asks(hidden);
  return Array.from(flat.matchAll(/[^.;()]+/gu)).flatMap((clause) =>
    stems.flatMap(({ patterns, saysHidden }) => {
      if (saysHidden.test(clause[0])) return [];
      return patterns.flatMap((pattern) => {
        const asked = pattern.exec(clause[0]);
        if (asked === null) return [];
        const line = prose.slice(0, clause.index + asked.index).split('\n').length;
        return [`${file}:${line}: "${asked[0]}" asks for a node hidden from VoiceOver`];
      });
    }),
  );
};

/** Every fault of `text`, the file `file`. */
const hiddenIdFaults = (file: string, text: string, hidden: Hidden): readonly string[] => [
  ...namedFaults(file, text, hidden),
  ...askFaults(file, text, hidden),
];

describe('hidden ids in verify-heartseed', () => {
  it('reads the hidden ids from the sources: a line break’s family, the growing seed and the home plant', () => {
    const hidden = hiddenOfApp();
    expect([...hidden.families]).toContain('break-');
    expect(['growing', 'growing-image', 'plant'].filter((id) => !hidden.ids.has(id))).toEqual([]);
    expect(hidden.ids.has('word-')).toBe(false);
  });

  it('reads an element hidden bare or by true, and not one hidden by a value or shown', () => {
    const hidden = hiddenIn(
      'a.tsx',
      [
        'const a = <View testID="bare" aria-hidden />;',
        'const b = <View testID="yes" aria-hidden={true} />;',
        'const c = <View testID={`row-${n}`} aria-hidden="true" />;',
        'const d = <Text testID="maybe" aria-hidden={shown.hidden} />;',
        'const e = <Text testID="shown" />;',
        'const f = <View testID="no" aria-hidden={false} />;',
      ].join('\n'),
    );
    expect({ ids: [...hidden.ids], families: [...hidden.families] }).toEqual({
      ids: ['bare', 'yes'],
      families: ['row-'],
    });
  });

  it('faults a numbered hidden id quoted or targeted and a hidden id targeted, never the family named alone', () => {
    const hidden: Hidden = { ids: new Set(['growing']), families: new Set(['break-']) };
    expect(
      hiddenIdFaults(
        'a.md',
        [
          'among them `break-8`, `break-16` and no other `break-`',
          '`sim tap "id=break-3"`',
          'a `break-<k>` before each line; no `break-`; `id=growing` shows',
          '`id=growing-seed`, `word-8`, a line break, and break-12 in prose',
        ].join('\n'),
        hidden,
      ),
    ).toEqual([
      'a.md:1: break-8 is hidden from VoiceOver',
      'a.md:2: break-3 is hidden from VoiceOver',
      'a.md:3: id=growing is hidden from VoiceOver',
      'a.md:4: break-12 is hidden from VoiceOver',
    ]);
  });

  it('faults a clause that asks for a hidden family’s or id’s nodes in any phrasing, unless it says they are hidden', () => {
    const hidden: Hidden = { ids: new Set(['growing']), families: new Set(['break-']) };
    const cases = {
      'family ids': 'the readout above (the count `k`, the checked grade, the `break-` ids).',
      'numbered family ids': '`id=passage`, and the `break-<k>` ids `light-today` names.',
      'plain break ids': 'Two raw snapshots, reading the break ids and the frames.',
      'wrapped ids': 'report the counts and the\n  `break-`\n  ids, never the words.',
      'break nodes': 'count the break nodes in the tree.',
      'break elements': 'the break elements in their order.',
      'reading the breaks': 'then read the breaks from the snapshot.',
      'counting the family': 'counting each `break-<k>` in the tree.',
      'hidden id nodes': 'the `growing` nodes in each snapshot.',
      'said hidden': 'the break elements are absent from VoiceOver’s order.',
      'said none': 'a `break-<k>` is hidden from VoiceOver, so the tree holds none.',
      'said no': 'no `break-` ids anywhere.',
      'family named': 'a `break-<k>` before each line, a sibling of the words.',
      'a line break': 'a sentence 19200, a line break 24000.',
      fenced: '```bash\n# read the break ids\n```',
    };
    expect(
      Object.fromEntries(
        Object.entries(cases).map(([name, text]) => [
          name,
          hiddenIdFaults('a.md', text, hidden).length > 0,
        ]),
      ),
    ).toEqual({
      'family ids': true,
      'numbered family ids': true,
      'plain break ids': true,
      'wrapped ids': true,
      'break nodes': true,
      'break elements': true,
      'reading the breaks': true,
      'counting the family': true,
      'hidden id nodes': true,
      'said hidden': false,
      'said none': false,
      'said no': false,
      'family named': false,
      'a line break': false,
      fenced: false,
    });
  });

  it('faults light.md’s and sayit.md’s drive steps as they read at round 2', () => {
    const hidden = hiddenOfApp();
    const steps = {
      'features/light.md':
        '   `id=passage`, and the `break-<k>` ids `light-today` names. Then\n   drive), reading the break ids and the frames of the five words after\n',
      'features/sayit.md': '   count `k`, the checked grade, the `break-` ids).\n',
    };
    expect(
      Object.entries(steps).map(([file, text]) => hiddenIdFaults(file, text, hidden).length),
    ).toEqual([3, 1]);
  });

  it('no feature file or SKILL.md looks for a hidden id in the tree', () => {
    const hidden = hiddenOfApp();
    const files = [
      'SKILL.md',
      ...readdirSync(join(SKILL, 'features'))
        .filter((file) => file.endsWith('.md'))
        .map((file) => `features/${file}`),
    ];
    expect(files.length).toBeGreaterThan(20);
    expect(
      files.flatMap((file) =>
        hiddenIdFaults(file, readFileSync(join(SKILL, file), 'utf8'), hidden),
      ),
    ).toEqual([]);
  });
});
