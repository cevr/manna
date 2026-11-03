/* oxlint-disable effect/noTernary, effect/noNullish, effect/maxCognitiveComplexity -- the acceptance oracle writes the find-place rule out as plain branches, apart from the product's Option code, so the two cannot share a mistake. */

import { describe, expect, it } from 'bun:test';
import { Option } from 'effect';

import { FindAt, findPlace, heightOf, REST, SOUNDING, sounding } from './bar';
import { Player, type Track, trackOf } from './player';

const three: Track = { number: 3, title: 'Three' };
const four: Track = { number: 4, title: 'Four' };
const length = Option.some(120);

const holding = (track: Track): ReadonlyArray<Player> => [
  Player.Loading({ track }),
  Player.Playing({ track, at: 30, length }),
  Player.Buffering({ track, at: 30, length, retry: false }),
  Player.Paused({ track, at: 30, length }),
  Player.Ended({ track, length }),
  Player.Stopped({ track, at: Option.none() }),
  Player.Failed({ track, offline: true, at: Option.none() }),
];
const states: ReadonlyArray<Player> = [Player.Idle(), ...holding(three), ...holding(four)];
const shownPages: ReadonlyArray<Option.Option<Track>> = [
  Option.none(),
  Option.some(three),
  Option.some(four),
];

const book = (n: string): boolean => /^[1-9]\d*$/.test(n) && Number(n) <= 695;
const none = (_: string): boolean => false;
const holdsAll = [
  { name: 'book', holds: book },
  { name: 'none', holds: none },
] as const;

const SHEETS = ['/settings', '/player', '/chord', '/about', '/tuner'];
const paths = [
  '/',
  '/recent',
  ...SHEETS,
  '/hymns/1',
  '/hymns/3',
  '/hymns/4',
  '/hymns/695',
  '/hymns/0',
  '/hymns/696',
  '/hymns/9999',
  '/hymns/abc',
  '/hymns/007',
  '/hymns',
  '/elsewhere',
];

type Seen = { readonly tag: FindAt['_tag']; readonly height: number };
const heightFor = (state: Player): number => (sounding(state) && SOUNDING) || REST;
const seen = (at: FindAt): Seen =>
  FindAt.$match(at, {
    Nowhere: () => ({ tag: 'Nowhere' as const, height: 0 }),
    Docked: () => ({ tag: 'Docked' as const, height: 0 }),
    Yielded: () => ({ tag: 'Yielded' as const, height: 0 }),
    OverBar: ({ state }) => ({ tag: 'OverBar' as const, height: heightFor(state) }),
  });

interface Input {
  readonly path: string;
  readonly holds: (n: string) => boolean;
  readonly shown: Option.Option<Track>;
  readonly state: Player;
  readonly raised: boolean;
}

const want = ({ path, holds, shown, state, raised }: Input): Seen => {
  const hymn = /^\/hymns\/([^/]+)$/.exec(path)?.[1];
  const holding = Option.isSome(trackOf(state));
  const drawn = SHEETS.includes(path)
    ? Option.isSome(shown) || holding
    : (hymn !== undefined && holds(hymn)) || holding;
  if (drawn && raised) return { tag: 'Yielded', height: 0 };
  if (drawn) return { tag: 'OverBar', height: heightFor(state) };
  if (path === '/') return { tag: 'Docked', height: 0 };
  return { tag: 'Nowhere', height: 0 };
};

const label = (input: Input, name: string) =>
  `${input.path} holds=${name} shown=${Option.match(input.shown, {
    onNone: () => 'none',
    onSome: (track) => String(track.number),
  })} state=${input.state._tag}:${Option.match(trackOf(input.state), {
    onNone: () => '-',
    onSome: (track) => String(track.number),
  })} raised=${input.raised}`;

describe('findPlace', () => {
  it('puts the # where the page the route draws puts it, over every path, shown page, state and raise', () => {
    const misses: Array<{ case: string; want: Seen; got: Seen }> = [];
    let cases = 0;
    for (const { name, holds } of holdsAll)
      for (const path of paths)
        for (const shown of shownPages)
          for (const state of states)
            for (const raised of [false, true]) {
              const input: Input = { path, holds, shown, state, raised };
              cases += 1;
              const got = seen(findPlace(input));
              const wanted = want(input);
              if (got.tag !== wanted.tag || got.height !== wanted.height)
                misses.push({ case: label(input, name), want: wanted, got });
            }
    expect({ cases, misses: misses.length, first: misses.slice(0, 5) }).toEqual({
      cases: 2 * paths.length * shownPages.length * states.length * 2,
      misses: 0,
      first: [],
    });
  });

  it('stands nowhere on an unknown hymn number with the player idle, as no bar is drawn there', () => {
    for (const path of ['/hymns/9999', '/hymns/0', '/hymns/696', '/hymns/abc', '/hymns/007'])
      for (const shown of shownPages)
        expect({
          path,
          at: findPlace({ path, holds: book, shown, state: Player.Idle(), raised: false })._tag,
        }).toEqual({ path, at: 'Nowhere' });
  });

  it('docks on the home list with a hymn page left shown under it and the player idle', () => {
    expect(
      findPlace({
        path: '/',
        holds: book,
        shown: Option.some(three),
        state: Player.Idle(),
        raised: false,
      })._tag,
    ).toBe('Docked');
  });
});

describe('heightOf', () => {
  it('is the bar’s one height rule in bar.ts: SOUNDING while the player sounds, REST in every other state', () => {
    expect(states.map((state) => [state._tag, heightOf(state)])).toEqual(
      states.map((state) => [state._tag, heightFor(state)]),
    );
    expect(new Set(states.map((state) => state._tag)).size).toBe(8);
  });
});
