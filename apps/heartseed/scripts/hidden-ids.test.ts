/* oxlint-disable effect/noNodeBuiltinImport, effect/noNullish -- the test reads the app's sources and verify-heartseed's feature files from disk, synchronously, as `probe-lines.test.ts` does; absent parser nodes are nullish. */

/**
 * A drive reads the simulator's accessibility tree, and a node hidden from
 * VoiceOver is not in it. So no step of verify-heartseed's `SKILL.md` or
 * `features/*.md` names a hidden node's id as one to find: neither
 * `id=<id>` nor, for a numbered family such as a line's `break-<k>`, a
 * quoted number of it (`` `break-8` ``). A row reads such a node from what
 * the tree does hold (the words' frames), or leaves it to the unit tests,
 * naming the family alone (`break-<k>`, `no break-`).
 *
 * The hidden ids come from the app's sources (`src`, `app`, tests left
 * out): each JSX element that carries `aria-hidden` (bare or `true`) and a
 * `testID` names that id, or, for a template, every id its literal opening
 * starts (`break-${word}` gives the family `break-`).
 */

import { describe, expect, it } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { Predicate } from 'effect';
import { parseSync, Visitor, type JSXAttribute, type Node } from 'oxc-parser';

const APP = join(import.meta.dir, '..');
const SKILL = join(APP, '../../.claude/skills/verify-heartseed');

/** The ids hidden from VoiceOver: whole ids, and the openings of numbered families. */
interface Hidden {
  readonly ids: ReadonlySet<string>;
  readonly families: ReadonlySet<string>;
}

const attribute = (attributes: readonly JSXAttribute[], name: string) =>
  attributes.findLast((each) => each.name.type === 'JSXIdentifier' && each.name.name === name);

const valueOf = (each: JSXAttribute | undefined): Node | null | undefined => {
  if (each?.value?.type === 'JSXExpressionContainer') return each.value.expression;
  return each?.value;
};

/** The hidden ids one source declares. */
const hiddenIn = (path: string, text: string): Hidden => {
  const ids = new Set<string>();
  const families = new Set<string>();
  new Visitor({
    JSXOpeningElement: (node) => {
      const attributes = node.attributes.filter(
        (each): each is JSXAttribute => each.type === 'JSXAttribute',
      );
      const hidden = attribute(attributes, 'aria-hidden');
      const flag = valueOf(hidden);
      if (hidden === undefined) return;
      if (
        flag != null &&
        !(flag.type === 'Literal' && (flag.value === true || flag.value === 'true'))
      )
        return;
      const id = valueOf(attribute(attributes, 'testID'));
      if (id?.type === 'Literal' && Predicate.isString(id.value)) ids.add(id.value);
      if (id?.type === 'TemplateLiteral' && id.expressions.length > 0) {
        const opening = id.quasis[0]?.value.cooked ?? '';
        if (opening !== '') families.add(opening);
      }
    },
  }).visit(parseSync(path, text, { sourceType: 'module' }).program);
  return { ids, families };
};

/** The hidden ids of every product source of the app. */
const hiddenOfApp = (): Hidden => {
  const sources = ['src', 'app'].flatMap((folder) =>
    readdirSync(join(APP, folder), { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && /\.tsx$/u.test(entry.name))
      .map((entry) => relative(APP, join(entry.parentPath, entry.name)))
      .filter((path) => !/\.test\.tsx$/u.test(path) && !path.startsWith('src/test/')),
  );
  const each = sources.map((path) => hiddenIn(path, readFileSync(join(APP, path), 'utf8')));
  return {
    ids: new Set(each.flatMap((hidden) => [...hidden.ids])),
    families: new Set(each.flatMap((hidden) => [...hidden.families])),
  };
};

const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

/** The faults of `text`, the file `file`: each line naming a hidden id as one the tree shows. */
const hiddenIdFaults = (file: string, text: string, hidden: Hidden): readonly string[] => {
  const patterns = [
    ...[...hidden.ids].map((id) => new RegExp(`id=${escaped(id)}(?![\\w-])`, 'u')),
    ...[...hidden.families].map(
      (family) => new RegExp(`(?:\`|id=)${escaped(family)}\\d+(?![\\w-])`, 'u'),
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
          '`id=growing-seed`, `word-8`, `break-` ids',
        ].join('\n'),
        hidden,
      ),
    ).toEqual([
      'a.md:1: `break-8 is hidden from VoiceOver',
      'a.md:2: id=break-3 is hidden from VoiceOver',
      'a.md:3: id=growing is hidden from VoiceOver',
    ]);
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
