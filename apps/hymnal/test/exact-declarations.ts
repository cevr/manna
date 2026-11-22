/**
 * The declarations in `exact/` that the Exact port reads in place of this
 * app's sources (`package.json`'s `types` conditions) stay true to them:
 * each source export is assigned to its declaration, so the type check of
 * `tsconfig.test.json` fails the day a source's signature drifts from what
 * the port was told. `player/bar` and `player/player` name each `Option` by
 * its shapes, which a function taking an `Option` cannot accept, so they
 * are held where the port runs them, against these sources
 * (`apps/hymnal-exact/src/player/step.model.test.ts`, `rules.test.ts`).
 * Nothing here runs.
 */

import type * as Appearance from '../exact/appearance';
import type * as Timeline from '../exact/follow/timeline';
import type * as Stanzas from '../exact/player/stanzas';
import type * as Time from '../exact/player/time';
import type * as Title from '../exact/player/title';
import type * as Remote from '../exact/remote';
import type * as Settings from '../exact/settings';
import type * as Theme from '../exact/theme';
import * as appearance from '../src/appearance';
import * as timeline from '../src/follow/timeline';
import * as stanzas from '../src/player/stanzas';
import * as time from '../src/player/time';
import * as title from '../src/player/title';
import * as remote from '../src/remote';
import * as settings from '../src/settings';
import * as theme from '../src/theme';

export const held = {
  appearance: { applyAppearance: appearance.applyAppearance } satisfies typeof Appearance,
  settings: { Appearance: settings.Appearance } satisfies typeof Settings,
  theme: { theme: theme.theme } satisfies typeof Theme,
  stanzas: {
    countOf: stanzas.countOf,
    keptOf: stanzas.keptOf,
    cutOf: stanzas.cutOf,
    toggle: stanzas.toggle,
    chosenOf: stanzas.chosenOf,
  } satisfies typeof Stanzas,
  time: { clock: time.clock } satisfies typeof Time,
  title: { titleGoes: title.titleGoes } satisfies typeof Title,
  remote: {
    HYMNS_ORIGIN: remote.HYMNS_ORIGIN,
    soundingOffset: remote.soundingOffset,
    audioKey: remote.audioKey,
    audioUrl: remote.audioUrl,
  } satisfies typeof Remote,
  timeline: {
    timelineOf: timeline.timelineOf,
    placeAt: timeline.placeAt,
  } satisfies typeof Timeline,
};
