/* oxlint-disable effect/noNodeBuiltinImport -- the test reads the features and the app's own source files from disk, synchronously, outside any Effect. */

/**
 * Each colour row of the verify-hymnal features names nodes that
 * `readout.ts colours` can read. The readout takes the first fiber with an
 * asked testID and reads its own style's `backgroundColor` and `color` and
 * the inks of the texts inside it, so the element the app's source gives
 * that testID must draw a colour itself: one in its style (inline, or a
 * `styles.<name>` entry that sets one), as a text (a `…Text` tag), or as
 * the ink of a text among its own children. A wrapper whose colour is a
 * child's (the find bar's glass is its capsule's) reads as `none`, or as a
 * deeper text's ink, and proves nothing of what the row claims. A row's
 * `<hole>` in an id matches a template testID with the same head
 * (`key-wheel-${item}`), or one handed on through a component's prop
 * (`id={`chord-${place}`}` to that component's `testID={id}`).
 */
import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const APP = join(import.meta.dir, '../..');
const FEATURES = join(APP, '../../.claude/skills/verify-hymnal/features');

type Text = readonly [file: string, text: string];

/** The app's own components under `src` and `app`, tests aside, as `[file, text]`. */
const sourcesOf = (): ReadonlyArray<Text> =>
  ['src', 'app'].flatMap((root) =>
    readdirSync(join(APP, root), { recursive: true })
      .map(String)
      .filter((name) => name.endsWith('.tsx') && !/\.test\.|(^|\/)test\//.test(name))
      .map((name): Text => [`${root}/${name}`, readFileSync(join(APP, root, name), 'utf8')]),
  );

const featuresOf = (): ReadonlyArray<Text> =>
  readdirSync(FEATURES)
    .filter((name) => name.endsWith('.md'))
    .map((name): Text => [name, readFileSync(join(FEATURES, name), 'utf8')]);

/** Each colour row's ids: every `--id` of a `readout.ts colours` command, by feature and row name. */
const rowsOf = (features: ReadonlyArray<Text>) =>
  features.flatMap(([file, text]) =>
    text
      .split('\n')
      .filter((line) => line.includes('readout.ts colours'))
      .map((line) => ({
        row: `${file} ${/`([a-z-]+)`/.exec(line)?.[1] ?? line.slice(0, 40)}`,
        ids: [...line.matchAll(/readout\.ts colours[^`]*`/g)].flatMap((command) =>
          [...command[0].matchAll(/--id ([^\s`]+)/g)].map((id) => id[1] ?? ''),
        ),
      })),
  );

/** The end of the JSX opening tag that starts at `start`: its `>` outside every brace and string. */
const openingEnd = (text: string, start: number) => {
  let depth = 0;
  let quote = '';
  for (let at = start; at < text.length; at += 1) {
    const char = text[at] ?? '';
    if (quote !== '') {
      if (char === quote) quote = '';
    } else if (char === '"' || char === "'" || char === '`') quote = char;
    else if (char === '{') depth += 1;
    else if (char === '}') depth -= 1;
    else if (char === '>' && depth === 0) return at;
  }
  return text.length;
};

/** Whether the JSX opening tag that starts at `start` closes itself. */
const selfClosing = (text: string, start: number) =>
  text.slice(start, openingEnd(text, start) + 1).endsWith('/>');

/** The element whose opening tag holds `at`: its tag, its opening tag's text and its children's text. */
const elementAt = (text: string, at: number) => {
  const open = [...text.slice(0, at).matchAll(/<([A-Z][\w.]*)/g)].at(-1);
  const tag = open?.[1] ?? '';
  const start = open?.index ?? 0;
  const end = openingEnd(text, start);
  const opening = text.slice(start, end + 1);
  const rest = text.slice(end + 1);
  let depth = Number(!opening.endsWith('/>'));
  let body = '';
  for (const mark of rest.matchAll(new RegExp(`<(/?)${tag.replace('.', '\\.')}(?![\\w.])`, 'g'))) {
    if (depth === 0) break;
    if (mark[1] === '/') depth -= 1;
    else if (!selfClosing(rest, mark.index)) depth += 1;
    if (depth === 0) body = rest.slice(0, mark.index);
  }
  return { tag, opening, body };
};

/** The tags of `body`'s own children: each element tag not inside another of the body's elements. */
const childTags = (body: string) => {
  const tags: Array<string> = [];
  let depth = 0;
  for (const mark of body.matchAll(/<(\/?)([A-Z][\w.]*)/g)) {
    if (mark[1] === '/') depth -= 1;
    else {
      if (depth === 0) tags.push(mark[2] ?? '');
      if (!selfClosing(body, mark.index)) depth += 1;
    }
  }
  return tags;
};

/** Whether `styles.<name>` in `text`'s stylesheet sets a colour the readout reads. */
const styleDraws = (text: string, name: string) =>
  new RegExp(`\\n\\s*${name}: \\{[^}]*\\b(backgroundColor|color):`).test(text);

/**
 * Whether the element whose opening tag holds `at` draws a colour the
 * readout reads: one of its own style's, its own text's, or the ink of a
 * text among its own children.
 */
const readableAt = (text: string, at: number) => {
  const { tag, opening, body } = elementAt(text, at);
  const styled = [...opening.matchAll(/\bstyles\.(\w+)/g)].some((name) =>
    styleDraws(text, name[1] ?? ''),
  );
  return (
    /Text$/.test(tag) ||
    /\b(backgroundColor|color):/.test(opening) ||
    styled ||
    childTags(body).some((child) => /(^|\.)Text$/.test(child))
  );
};

/** A testID attribute: a string, a template's head before its first hole, or a prop handed on. */
const TEST_ID = /\btestID=(?:"([^"]+)"|\{`([^`$]*)\$\{|\{(\w+)\})/g;

/**
 * Where the source gives `id`: each element whose testID is the id, or for
 * an id with a `<hole>`, a template with its head, either on the element
 * itself or handed on as a component's prop to that component's
 * `testID={prop}`. Each place says whether it draws a colour.
 */
const placesOf = (sources: ReadonlyArray<Text>, id: string) => {
  const head = id.split('<')[0] ?? id;
  const holed = id.includes('<') && head !== '';
  return sources.flatMap(([file, text]) =>
    [...text.matchAll(TEST_ID)]
      .filter(
        ([, literal = '', template = '', prop = '']) =>
          (!holed && literal === id) ||
          (holed && template === head) ||
          (holed && prop !== '' && new RegExp(`\\b${prop}=\\{\`${head}\\$\\{`).test(text)),
      )
      .map((match) => ({ file, readable: readableAt(text, match.index) })),
  );
};

/** The rows whose ids the source gives no readable node: each id, and where it was found. */
const unreadable = (features: ReadonlyArray<Text>, sources: ReadonlyArray<Text>) =>
  rowsOf(features).flatMap(({ row, ids }) =>
    ids
      .map((id) => ({ id, places: placesOf(sources, id) }))
      .filter(({ places }) => !places.some((place) => place.readable))
      .map(({ id, places }) => {
        const found = places.map((place) => place.file).join(', ') || 'no testID';
        return `${row}: --id ${id} (${found})`;
      }),
  );

describe('colour rows', () => {
  test('every colour row of the verify-hymnal features names nodes the readout can read', () => {
    const features = featuresOf();
    expect(rowsOf(features).length).toBeGreaterThan(5);
    expect(unreadable(features, sourcesOf())).toEqual([]);
  });

  test('a wrapper whose colour is a child’s, and an id no source gives, are refused', () => {
    const row = (ids: string): ReadonlyArray<Text> => [
      ['f.md', `- \`r\`: \`bun scripts/readout.ts colours --port $PORT ${ids}\``],
    ];
    const sources: ReadonlyArray<Text> = [
      [
        'src/a.tsx',
        [
          'const A = () => (',
          '  <>',
          '    <View testID="wrap" style={styles.row}>',
          '      <View style={styles.row} />',
          '      <Animated.View testID="pill" style={[styles.pill, grown]} />',
          '      <Pressable onPress={go}>',
          '        <Text style={styles.row}>x</Text>',
          '      </Pressable>',
          '    </View>',
          '    <Text testID="word" style={styles.row}>x</Text>',
          '    <View testID="holder">',
          '      {words.map((word) => (',
          '        <Text key={word}>{word}</Text>',
          '      ))}',
          '    </View>',
          '  </>',
          ');',
          'const B = () => <Inked id={`ink-${place}`} />;',
          'function Inked({ id }) { return <ChordText testID={id} />; }',
          'const C = () => <View testID={`dot-${n}`} style={{ backgroundColor: c }} />;',
          'const styles = StyleSheet.create({',
          "  row: { flexDirection: 'row' },",
          '  pill: { height: 4, backgroundColor: color.glass },',
          '});',
        ].join('\n'),
      ],
    ];
    expect(
      unreadable(row('--id pill --id word --id holder --id ink-<p> --id dot-<n>'), sources),
    ).toEqual([]);
    expect(unreadable(row('--id wrap --id gone --id dash-<n>'), sources)).toEqual([
      'f.md r: --id wrap (src/a.tsx)',
      'f.md r: --id gone (no testID)',
      'f.md r: --id dash-<n> (no testID)',
    ]);
  });
});
