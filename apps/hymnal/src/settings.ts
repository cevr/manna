/**
 * The reader's settings, kept in a key-value store: the device's own on a
 * phone and the web (`src/store.ts`), or one a test hands in. A setting
 * survives a restart because `Atom.kvs` writes it through.
 *
 * A static web page is rendered with each default, so hydration reads the
 * default too and the stored value comes in the render after it; reading the
 * store first would leave the server's markup standing over the stored value.
 */

import { type Layer, Schema } from 'effect';
// The module itself: the `effect/persistence` barrel brings in a SQL
// migrator whose dynamic import() Hermes cannot compile.
import type * as KeyValueStore from 'effect/persistence/KeyValueStore';
import * as Atom from 'effect/reactivity/Atom';

import { Move, still } from './hymns/chords';
import { ChordStyle } from './hymns/simple';
import { Placement } from '@manna/hymnal/placement';
import { Numbers } from './reader/lists';
import { DEFAULT_SIZE, Font, Size, Spacing } from './reader/reading';

/** How the app is shown: as the system is set, or always light, or always dark. */
export const Appearance = Schema.Literals(['system', 'light', 'dark']);
export type Appearance = typeof Appearance.Type;

export const PlacementOverride = Schema.Literals(['inherit', ...Placement.literals]);
export type PlacementOverride = typeof PlacementOverride.Type;
/** Long accessible labels and compact marks belong to the app's controls. */
export const placements = [
  { value: 'beat', label: 'On the beat', mark: 'Beat' },
  { value: 'simpler', label: 'Simpler', mark: 'Simpler' },
  { value: 'file', label: 'As the file plays', mark: 'File' },
] as const satisfies ReadonlyArray<{ value: Placement; label: string; mark: string }>;

/** The reading settings, each its own stored atom. */
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
  return {
    /** A hymn shows its words alone until the reader turns chords on. */
    chords: setting('chords', Schema.Boolean, false),
    /**
     * How chords are shown (`src/hymns/simple.ts`): Simple, a plain chord
     * per syllable at most, until the reader picks Advanced in Settings.
     * The same for every hymn.
     */
    chordStyle: setting('chords.style', ChordStyle, 'simple'),
    /** Global chord anchors; a hymn inherits until it has an explicit override. */
    placement,
    placementFor,
    effectivePlacement,
    appearance: setting('appearance', Appearance, 'system'),
    /**
     * Whether Play sounds the recording, the switch beside Play: the same
     * for every hymn, on until the reader turns it off. Off, Play runs the
     * score clock (`src/player/sound.ts`) and nothing sounds.
     */
    sound: setting('sound', Schema.Boolean, true),
    /**
     * Whether the controls are felt and heard (`src/feel/`): a haptic and a
     * short sound for each touch that gives a cue. On until the reader turns
     * it off in Settings; off, no cue has a body.
     */
    feel: setting('feel', Schema.Boolean, true),
    /**
     * Each hymn's transpose and capo, by its number: a move fits one hymn's
     * key and the singers' range for it, so it never reaches another hymn.
     */
    move: Atom.family((number: number) => setting(`move.${number}`, Move, still)),
    /**
     * How a hymn page is set (`src/reader/reading.ts`), chosen in the player
     * sheet's reading section: the same for every hymn. The defaults set
     * the page as it has always been, with the screen left to sleep as the
     * system sets it.
     */
    reading: {
      size: setting('reading.size', Size, DEFAULT_SIZE),
      font: setting('reading.font', Font, 'system'),
      spacing: setting('reading.spacing', Spacing, 'normal'),
      awake: setting('reading.awake', Schema.Boolean, false),
    },
    /**
     * The reader's own lists of hymn numbers (`src/reader/lists.ts`), kept
     * apart from the hymn text: Favourites in number order, and Recent, the
     * hymns last opened, the latest first.
     */
    lists: {
      favourites: setting('lists.favourites', Numbers, []),
      recent: setting('lists.recent', Numbers, []),
    },
  };
};
