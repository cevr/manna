import { type Layer, Schema } from 'effect';
import type * as KeyValueStore from 'effect/persistence/KeyValueStore';
import * as Atom from 'effect/reactivity/Atom';

import { Move, still } from './hymns/chords';
import { ChordStyle } from './hymns/simple';
import { Placement } from '@manna/hymnal/placement';
import { TAB_NAMES } from './home/tabs';
import { ALL, Choice } from './player/stanzas';
import { DEFAULT_TEMPO, Tempo } from './player/tempo';
import { Numbers } from './reader/lists';
import { DEFAULT_SIZE, Font, Size, Spacing } from './reader/reading';

export const Appearance = Schema.Literals(['system', 'light', 'dark']);
export type Appearance = typeof Appearance.Type;

export const PlacementOverride = Schema.Literals(['inherit', ...Placement.literals]);
export type PlacementOverride = typeof PlacementOverride.Type;
export const placements = [
  { value: 'beat', label: 'On the beat', mark: 'Beat' },
  { value: 'simpler', label: 'Simpler', mark: 'Simpler' },
  { value: 'file', label: 'As the file plays', mark: 'File' },
] as const satisfies ReadonlyArray<{ value: Placement; label: string; mark: string }>;

const HomeTab = Schema.Literals(TAB_NAMES);

export type ReadingSettings = ReturnType<typeof settingsOn>['reading'];

export const settingsOn = (store: Layer.Layer<KeyValueStore.KeyValueStore>) => {
  const runtime = Atom.runtime(store);
  const setting = <S extends Schema.ConstraintCodec<unknown, unknown>>(
    key: string,
    schema: S,
    initial: S['Type'],
  ) =>
    Atom.withServerValue(
      Atom.kvs({ runtime, key, schema, defaultValue: () => initial, mode: 'sync' }),
      () => initial,
    );
  const placement = setting('chords.placement', Placement, 'beat');
  const placementFor = Atom.family((number: number) =>
    setting(`chords.placement.${number}`, PlacementOverride, 'inherit'),
  );
  const effectivePlacement = Atom.family((number: number) =>
    Atom.withServerValue(
      Atom.make((get) => {
        const own = get(placementFor(number));
        if (own === 'inherit') return get(placement);
        return own;
      }),
      (): Placement => 'beat',
    ),
  );
  const chords = setting('chords', Schema.Boolean, false);
  const move = Atom.family((number: number) => setting(`move.${number}`, Move, still));
  const heardMove = Atom.family((number: number) =>
    Atom.withServerValue(
      Atom.make((get): Move => {
        if (!get(chords)) return still;
        return get(move(number));
      }),
      (): Move => still,
    ),
  );
  return {
    chords,
    chordStyle: setting('chords.style', ChordStyle, 'simple'),
    placement,
    placementFor,
    effectivePlacement,
    appearance: setting('appearance', Appearance, 'system'),
    sound: setting('sound', Schema.Boolean, true),
    feel: setting('feel', Schema.Boolean, true),
    move,
    heardMove,
    tempo: Atom.family((number: number) => setting(`tempo.${number}`, Tempo, DEFAULT_TEMPO)),
    stanzas: Atom.family((number: number) => setting(`stanzas.${number}`, Choice, ALL)),
    intro: setting('intro', Schema.Boolean, true),
    click: setting('click', Schema.Boolean, false),
    reading: {
      size: setting('reading.size', Size, DEFAULT_SIZE),
      font: setting('reading.font', Font, 'system'),
      spacing: setting('reading.spacing', Spacing, 'normal'),
      awake: setting('reading.awake', Schema.Boolean, false),
    },
    lists: {
      favourites: setting('lists.favourites', Numbers, []),
      recent: setting('lists.recent', Numbers, []),
    },
    home: {
      tab: setting('home.tab', HomeTab, 'Sections'),
    },
  };
};
