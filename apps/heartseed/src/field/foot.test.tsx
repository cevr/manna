/* oxlint-disable effect/noAsyncFunction, effect/noTernary, effect/noNullish, effect/noNodeBuiltinImport -- a drawing test: it mounts the field screen through React's promise-based act in happy-dom, its screen of its own spells each JSX form a node under the lists takes, a ternary and a nullish fallback among them, and it loads the journey files through a file system that reads the disk synchronously, since Bun's asynchronous reads refuse happy-dom's AbortSignal. */

/**
 * Home's foot, read from the field screen as it renders (`../test/foot`):
 * every test id and label the scroll view draws after its last furrow, in
 * each state the foot changes with (the passages read under the limit with
 * the tips, read at the limit, unread). It equals the foot written out by
 * hand (`HOME_FOOT`); a screen of its own puts each JSX form a node there
 * can take under its furrows, and each is read; and R7 (`footFaults`) holds
 * every shipped journey to the rendered foot, and trips a journey that
 * ends on a scroll to any node of it, in each spelling, after a sheet too.
 */

import * as BunPath from '@effect/platform-bun/BunPath';
import { describe, expect, it } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { Effect, FileSystem, Layer, Option, type Path, Schema } from 'effect';
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { Button, Pressable, ScrollView, Text, View } from 'react-native';

import { footFaults, journeyOfText, shippedJourneys } from '../../scripts/journey-rules';
import { type Foot, HOME_FOOT } from '../../scripts/foot';
import type { Furrow } from '../home';
import type { PassagesView } from '../passages';
import { footOfHost } from '../test/foot';
import { Furrows } from './plot';
import { FieldScreen } from './screen';

const toJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));

/** Files a journey load writes, by path; read before the disk. */
const written = new Map<string, string>();

/**
 * A file system for loading journeys under happy-dom, whose `AbortSignal`
 * Bun's asynchronous file reads refuse: the disk read synchronously, and a
 * journey file a test writes kept in `written`.
 */
const journalFs = FileSystem.layerNoop({
  readDirectory: (dir) => Effect.sync(() => readdirSync(dir)),
  readFileString: (path) => Effect.sync(() => written.get(path) ?? readFileSync(path, 'utf8')),
  writeFileString: (path, text) => Effect.sync(() => void written.set(path, text)),
  makeTempDirectoryScoped: () => Effect.succeed('/nonexistent/hsr7-foot'),
});

/** `effect` with the journey file system and Bun's path. */
const read = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>) =>
  effect.pipe(Effect.provide(Layer.merge(journalFs, BunPath.layer)));

const furrow = (id: string): Furrow => ({
  id,
  title: `List ${id}`,
  source: { _tag: 'Own' },
  kind: 'own',
  icon: 'seed',
  caption: '1 verse',
  plants: [],
});

/** Two furrows, so what sits under the first row (tip 2) sits above the last. */
const FURROWS = [furrow('a'), furrow('b')];

const range = (chapter: number) => ({ book: 19, chapter, first: 1, last: 2 });
const UNDER: PassagesView = { _tag: 'Read', passages: [range(1)], lists: [] };
const FULL: PassagesView = { _tag: 'Read', passages: [range(1), range(2), range(3)], lists: [] };
const UNREAD: PassagesView = { _tag: 'Unread' };

/** What `node` draws, mounted in the document: its foot, or none. */
const drawn = async (node: ReactNode) => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(node));
  const foot = footOfHost(host);
  await act(async () => root.unmount());
  host.remove();
  return foot;
};

const noop = () => {};

/** Home's field screen over `passages`, the tour's tips shown or not. */
const screen = (passages: PassagesView, tips: boolean) => (
  <FieldScreen
    field={{ rows: [], sown: 0, harvest: 0 }}
    furrows={FURROWS}
    passages={passages}
    greeting={{ words: 'Good morning', icon: 'sun' }}
    card={{ headline: Option.none(), parts: Option.none(), action: { _tag: 'None' } }}
    starts={() => Option.none()}
    tips={tips}
    scrolled={0}
    onScrolled={noop}
    onToday={noop}
    onStart={noop}
    onAdd={noop}
    onAbout={noop}
    onHow={noop}
    onGotIt={noop}
    onOpen={noop}
  />
);

/** Each foot's ids and labels together. */
const union = (feet: ReadonlyArray<Foot>): Foot => ({
  ids: new Set(feet.flatMap((foot) => [...foot.ids])),
  labels: new Set(feet.flatMap((foot) => [...foot.labels])),
});

const sorted = (foot: Option.Option<Foot>) =>
  Option.map(foot, (some) => ({ ids: [...some.ids].sort(), labels: [...some.labels].sort() }));

/** Home's foot over every state it changes with: under the limit with the tips, at the limit, unread. */
const renderedFoot = async () => {
  const feet = [
    await drawn(screen(UNDER, true)),
    await drawn(screen(UNDER, false)),
    await drawn(screen(FULL, true)),
    await drawn(screen(UNREAD, false)),
  ];
  expect(feet.map(Option.isSome)).toEqual([true, true, true, true]);
  return union(feet.flatMap(Option.toArray));
};

/** A component that passes every prop it takes to its view. */
function Mark(props: { readonly testID: string }) {
  return <View {...props} />;
}

/** A component that draws `label` and hands the rest of its props to its button. */
function Rest({ label, ...rest }: { readonly label: string; readonly testID: string }) {
  return (
    <Pressable {...rest} onPress={noop}>
      <Text>{label}</Text>
    </Pressable>
  );
}

/** A component that draws the children it is given. */
function Box({ children }: { readonly children: ReactNode }) {
  return <View>{children}</View>;
}

/** A component with two returns, the second drawn when not `first`. */
function Either({ first }: { readonly first: boolean }) {
  if (first) return <Text testID="first-return">First return</Text>;
  return <Text testID="second-return">Second return</Text>;
}

/** A component whose prop is renamed where it is taken. */
function Renamed({ label: shown }: { readonly label: string }) {
  return <Text>{shown}</Text>;
}

/** A screen of its own: one node above its furrows, one under the first row, one outside the scroll view, and under the furrows each form a node there takes. */
function Fixture({
  none,
  some,
  fallback,
}: {
  readonly none: boolean;
  readonly some: Option.Option<string>;
  readonly fallback?: ReactNode;
}) {
  const held = <Text testID="held">Held in a const</Text>;
  const kinds = ['kept', 'dropped', 'also kept'];
  return (
    <View>
      <ScrollView testID="field-scroll">
        <Text testID="above">Above</Text>
        <View>
          <Furrows
            furrows={FURROWS}
            onPlant={noop}
            onOpen={noop}
            underFirst={<Text testID="under-first">Under the first</Text>}
          />
          <Text testID="in-wrap">In the wrapper</Text>
        </View>
        <View {...{ testID: 'spread' }} />
        <Mark testID="mark" />
        <Rest label="Rest words" testID="rest" />
        {none || <Text testID="or">Or words</Text>}
        {fallback ?? <Text testID="nullish">Nullish words</Text>}
        {none ? <Text testID="else">Never</Text> : <Text testID="then">Then words</Text>}
        {Option.match(some, {
          onNone: () => null,
          onSome: (words) => <Text testID="matched">{words}</Text>,
        })}
        <Box>
          <Text testID="child">Child words</Text>
        </Box>
        <Either first={none} />
        <Renamed label="Renamed words" />
        {kinds
          .filter((kind) => kind !== 'dropped')
          .map((kind) => (
            <Text key={kind}>{kind}</Text>
          ))}
        {held}
        {42}
        <View>
          <View>
            <Pressable testID="deep" aria-label="Deep words" onPress={noop} />
          </View>
        </View>
        <Button title="Package words" onPress={noop} />
      </ScrollView>
      <Text testID="outside">Outside</Text>
    </View>
  );
}

const home = {
  name: 'home',
  action: 'open',
  link: '/',
  relaunch: false,
  expect: [{ shows: 'id=today-card' }],
  receipt: 'none',
};
const scroll = (name: string, target: string, direction = 'down') => ({
  name,
  action: 'scroll',
  target,
  direction,
  receipt: 'none',
});

/** Each spelling `sim` reads of a foot node: an id bare, quoted and after a role; a label as is, quoted in capitals, bare and after a role. */
const spellings = (foot: Foot) => [
  ...[...foot.ids].flatMap((id) => [`id=${id}`, `id="${id}"`, `role=button id=${id}`]),
  ...[...foot.labels].flatMap((label) => [
    `label=${label}`,
    `label="${label.toUpperCase()}"`,
    label,
    `role=button label=${label}`,
  ]),
];

describe('home’s foot as the field screen draws it', () => {
  it('is every id and label drawn after the furrows, in each state, as written out by hand', async () => {
    expect(sorted(Option.some(await renderedFoot()))).toEqual(sorted(Option.some(HOME_FOOT)));
  });

  it('reads each form a node under the furrows takes: a sibling in their wrapper, a spread, props passed on or by rest, a fallback, a branch, a match, children, a later return, a renamed prop, a filtered map, a const, a number, nesting, a package component; nothing above them, under the first row or outside the scroll view', async () => {
    expect(
      sorted(await drawn(<Fixture none={false} some={Option.some('Matched words')} />)),
    ).toEqual(
      Option.some({
        ids: [
          'child',
          'deep',
          'held',
          'in-wrap',
          'mark',
          'matched',
          'nullish',
          'or',
          'rest',
          'second-return',
          'spread',
          'then',
        ],
        labels: [
          '42',
          'also kept',
          'child words',
          'deep words',
          'held in a const',
          'in the wrapper',
          'kept',
          'matched words',
          'nullish words',
          'or words',
          'package words',
          'renamed words',
          'rest words',
          'second return',
          'then words',
        ],
      }),
    );
    expect(await drawn(<View testID="field-scroll" />)).toEqual(Option.none());
  });

  it('R7 holds every shipped journey to the rendered foot, and trips a journey ending on a scroll to any node of it, in each spelling, after a sheet too, unless it scrolls back up', async () => {
    const foot = await renderedFoot();
    const shipped = await Effect.runPromise(read(shippedJourneys));
    expect(shipped.length > 0).toBe(true);
    expect(shipped.flatMap((journey) => footFaults(journey, foot))).toEqual([]);
    const sheet = [
      { name: 'sheet', action: 'tap', target: 'label=Settings', receipt: 'none' },
      scroll('inside', 'label=About'),
    ];
    const cases = spellings(foot).flatMap((target) =>
      [[], sheet].flatMap((tail) => [
        {
          target,
          steps: [home, scroll('foot', target), ...tail],
          want: ['gen/foot leaves home at its foot'],
        },
        {
          target,
          steps: [home, scroll('foot', target), ...tail, scroll('top', 'label=Your field', 'up')],
          want: [],
        },
      ]),
    );
    const got = await Effect.runPromise(
      read(
        Effect.forEach(cases, ({ steps }) =>
          journeyOfText('gen', toJson({ feature: 'gen', platform: 'ios', steps })),
        ).pipe(Effect.scoped),
      ),
    );
    expect(
      cases.flatMap(({ target, want }, at) => {
        const faults = footFaults(got[at]!, foot);
        if (toJson(faults) === toJson(want)) return [];
        return [`${target}: got ${toJson(faults)} want ${toJson(want)}`];
      }),
    ).toEqual([]);
    expect(cases.length).toBe(4 * (3 * foot.ids.size + 4 * foot.labels.size));
  });
});
