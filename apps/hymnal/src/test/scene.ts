import type { TabName } from '~/home/tabs';

/**
 * A state of the app a verify-hymnal journey's step leaves it in, as
 * `phone-scenes.tsx` draws it: a route's screen and how it is set up.
 */
export interface Scene {
  /**
   * The route shown: the home list, a hymn's page (`/hymns/<hymn>`), or a
   * sheet drawn alone (Settings, About this hymn, the chord sheet of the
   * hymn's first chord) or over its hymn's bar (the player sheet).
   */
  readonly route: 'home' | 'hymn' | 'player' | 'settings' | 'about' | 'chord';
  /** The hymn the route or the sheet is about: 100 when not named. */
  readonly hymn?: number;
  /** Chords on. */
  readonly chords?: boolean;
  /** The chord style Advanced. */
  readonly advanced?: boolean;
  /** The home list's tab: Sections when not named. */
  readonly tab?: TabName;
  /** The home list opened at this topic, as About's topic opens it. */
  readonly topic?: string;
  /**
   * Recent's hymns, the latest first: `[100]`, as after the reader's first
   * hymn, when not named. The home list draws their rows at its top, in
   * Recent's shelf: a scene names here a hymn whose row a journey scrolls
   * the list to, since the stand-in phone draws only the list's first screen.
   */
  readonly recent?: ReadonlyArray<number>;
  /** `All at once` shown over the home list. */
  readonly tiles?: boolean;
  /** The find bar's search open with this typed. */
  readonly search?: string;
  /** The `#`'s drums open. */
  readonly drums?: boolean;
  /** The key button tapped: the bar's dials open. */
  readonly dials?: boolean;
  /** The hymn transposed, so the dials offer Reset. */
  readonly moved?: boolean;
  /** The hymn's chosen stanzas: every stanza when not named. */
  readonly stanzas?: ReadonlyArray<number>;
  /** The hymn's tempo in percent: 100 when not named. */
  readonly tempo?: number;
  /** The hymn playing on a fake device, Play pressed on its bar. */
  readonly playing?: boolean;
  /** While playing, a hand scroll of the page held the follow. */
  readonly hand?: boolean;
}
