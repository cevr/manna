/* oxlint-disable effect/noAsyncFunction, effect/noTernary, effect/noNullish, effect/noNodeBuiltinImport, eslint/no-await-in-loop -- a drawing test: it mounts the field screen through React's promise-based act in happy-dom, one home state after another since act scopes do not overlap, its screen of its own spells each JSX form a node under the lists takes, a ternary and a nullish fallback among them, and it loads the journey files through a file system that reads the disk synchronously, since Bun's asynchronous reads refuse happy-dom's AbortSignal. */

/**
 * Home's foot, read from the field screen as it renders (`../test/foot`):
 * every test id and label the scroll view draws after its last furrow, in
 * every home state over each prop the screen draws by (one to four furrows,
 * the tips shown or not, the passages read under the limit, with a list,
 * at the limit or unread, a field sown or not, the card's `Start` or none,
 * and no single verse, two or the most, 20).
 * Each state's foot lies within the foot written out by hand
 * (`HOME_FOOT`) and together they draw all of it; a screen with no furrow
 * gives no foot, as home always draws its own list (`app/index.tsx`'s
 * `PASSAGES`). A screen of its own puts each JSX form a node there
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
import type { Furrow, SinglePlant } from '../home';
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

/** Two furrows, for the screen of its own: what sits under the first row sits above the last. */
const FURROWS = [furrow('a'), furrow('b')];

/** `n` furrows, each holding a plant at a stage of its own, the first ready. */
const furrowsOf = (n: number): readonly Furrow[] =>
  Array.from({ length: n }, (_, at) => ({
    ...furrow(String(at)),
    plants: [
      {
        reference: `Ref ${at}`,
        stage: at % 2 === 0 ? 'not planted' : 'blade',
        ready: at === 0,
        label: `Ref ${at}`,
      },
    ],
  }));

const range = (chapter: number) => ({ book: 19, chapter, first: 1, last: 2 });
const UNDER: PassagesView = { _tag: 'Read', passages: [range(1)], lists: [], singles: [] };
const LISTED: PassagesView = {
  _tag: 'Read',
  passages: [range(1)],
  lists: ['a-list'],
  singles: [],
};
const FULL: PassagesView = {
  _tag: 'Read',
  passages: [range(1), range(2)],
  lists: ['a-list'],
  singles: [],
};

/** The single verses home may draw under the lists (hsminlist): none, the own verse beside one planted alone, or 20, the most. */
const SINGLES: ReadonlyArray<readonly SinglePlant[]> = [
  [],
  [
    {
      reference: 'Isaiah 41:10',
      stage: 'seed',
      ready: true,
      label: 'Isaiah 41:10, seed, ready today',
      removal: Option.none(),
    },
    {
      reference: 'Proverbs 4:23',
      stage: 'blade',
      ready: false,
      label: 'Proverbs 4:23, blade',
      removal: Option.some({ book: 20, chapter: 4, first: 23, last: 23 }),
    },
  ],
  Array.from({ length: 20 }, (_, at) => ({
    reference: `Psalms 119:${at + 1}`,
    stage: 'not planted' as const,
    ready: false,
    label: `Psalms 119:${at + 1}, not planted`,
    removal: Option.none(),
  })),
];
const UNREAD: PassagesView = { _tag: 'Unread' };

/** One state of home: how many furrows, the single verses, whether the tips show, the passages, the days sown, and whether the card offers `Start`. */
interface HomeState {
  readonly furrows: number;
  readonly singles: readonly SinglePlant[];
  readonly tips: boolean;
  readonly passages: PassagesView;
  readonly sown: number;
  readonly start: boolean;
}

/** Every home state over the props the screen draws by, each value of each crossed with every other with no single verse; then each furrow count with each run of single verses (which draw apart from the card, the days sown and Start), the tips shown or not, under the limit or at it. */
const STATES: ReadonlyArray<HomeState> = [
  ...[0, 1, 2, 3, 4].flatMap((furrows) =>
    [true, false].flatMap((tips) =>
      [UNDER, LISTED, FULL, UNREAD].flatMap((passages) =>
        [0, 4].flatMap((sown) =>
          [true, false].map((start) => ({ furrows, singles: [], tips, passages, sown, start })),
        ),
      ),
    ),
  ),
  ...[0, 1, 2, 3, 4].flatMap((furrows) =>
    SINGLES.slice(1).flatMap((singles) =>
      [true, false].flatMap((tips) =>
        [UNDER, FULL].map((passages) => ({
          furrows,
          singles,
          tips,
          passages,
          sown: 4,
          start: true,
        })),
      ),
    ),
  ),
];

const nameOf = (state: HomeState) =>
  `${state.furrows} furrows, ${state.singles.length} single verses, tips ${state.tips}, ${state.passages._tag === 'Read' ? `${state.passages.passages.length + state.passages.lists.length} held` : 'unread'}, sown ${state.sown}, start ${state.start}`;

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

/** Home's field screen in `state`. */
const screen = (state: HomeState) => (
  <FieldScreen
    field={{ rows: [], sown: state.sown, harvest: Math.min(state.sown, 1) }}
    furrows={furrowsOf(state.furrows)}
    singles={state.singles}
    onUproot={async () => 'Removed'}
    passages={state.passages}
    greeting={{ words: 'Good morning', icon: 'sun' }}
    card={{
      headline: Option.none(),
      parts: Option.none(),
      action: state.start ? { _tag: 'Start' } : { _tag: 'None' },
    }}
    starts={() => Option.none()}
    tips={state.tips}
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

/** Each home state with the foot it draws, rendered once for the file. */
const statesDrawn = (async () => {
  const out: Array<{ readonly state: HomeState; readonly foot: Option.Option<Foot> }> = [];
  for (const state of STATES) out.push({ state, foot: await drawn(screen(state)) });
  return out;
})();

/** Home's foot: every state's foot together. */
const renderedFoot = async () =>
  union((await statesDrawn).flatMap(({ foot }) => Option.toArray(foot)));

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
  it('is every id and label drawn after the furrows, in each home state within the foot written out by hand, and all of it over every state; none with no furrow', async () => {
    const states = await statesDrawn;
    expect(states.length).toBe(200);
    expect(
      states.flatMap(({ state, foot }) => {
        if (state.furrows === 0) return Option.isNone(foot) ? [] : [`${nameOf(state)}: a foot`];
        if (Option.isNone(foot)) return [`${nameOf(state)}: no foot`];
        return [
          ...[...foot.value.ids].filter((id) => !HOME_FOOT.ids.has(id)),
          ...[...foot.value.labels].filter((label) => !HOME_FOOT.labels.has(label)),
        ].map((target) => `${nameOf(state)}: ${target}`);
      }),
    ).toEqual([]);
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
