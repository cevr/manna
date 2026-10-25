/**
 * What one detent of the key or the capo dial draws again on hymn 100's
 * page (spec Risk 7): the chord texts alone, through the played key's
 * context, and never a section, a line or its syllables.
 *
 * Three counters stand on the real page, each a wrapper that draws or calls
 * the real one:
 * - `ChordLines`, a section's lines under their chords, counts the sections
 *   drawn again: with chords on, every section of the page draws one;
 * - `SyllableLine` counts the sung lines drawn again, with their syllables;
 * - `useChordTap` counts the chord texts drawn again: `ChordText` alone
 *   calls it, once a draw.
 *
 * `test:slow` runs this file in a process of its own, so no other file
 * meets the wrappers.
 */

import { describe, expect, it, mock } from 'bun:test';
import { RegistryContext } from '@effect/atom-react';
import { Duration, Option } from 'effect';
import * as AtomRegistry from 'effect/reactivity/AtomRegistry';
import { act, type ComponentProps } from 'react';
import { View } from 'react-native';
import { createRoot } from 'react-dom/client';

import { hymnAt } from '~/hymns/hymns';
import * as Sheet from '~/reader/ChordSheet';
import * as Chords from '~/reader/Chords';
import { HymnPage } from '~/reader/HymnPage';
import { Shown } from '~/reader/screen';
import * as Syllables from '~/reader/SyllableWords';

import { fakeDevice } from '../test/device';
import { perform } from '../test/props';
import { readerOn } from '../test/reader';
import { PlayerContext } from './context';
import { ChordReaderContext } from './Dials';
import { playerOn } from './player';
import { PageBar } from './PlayerBar';

const drawn = { sections: 0, lines: 0, chords: 0 };
const Lines = Chords.ChordLines;
const line = Syllables.SyllableLine;
const tap = Sheet.useChordTap;
// oxlint-disable-next-line effect/noModuleMocks -- a section's draws are counted on the real page, so its chord lines are wrapped; the wrapper draws the real ones, and test:slow runs this file alone.
mock.module('~/reader/Chords', () => ({
  ...Chords,
  ChordLines: (props: ComponentProps<typeof Lines>) => {
    drawn.sections += 1;
    return <Lines {...props} />;
  },
}));
// oxlint-disable-next-line effect/noModuleMocks -- a line's draws are counted on the real page, so its line is wrapped; the wrapper draws the real line, and test:slow runs this file alone.
mock.module('~/reader/SyllableWords', () => ({
  SyllableLine: (props: ComponentProps<typeof line>) => {
    drawn.lines += 1;
    return line(props);
  },
}));
// oxlint-disable-next-line effect/noModuleMocks -- a chord text's draws are counted by the hook it alone calls; the wrapper calls the real hook, and test:slow runs this file alone.
mock.module('~/reader/ChordSheet', () => ({
  ...Sheet,
  useChordTap: () => {
    drawn.chords += 1;
    return tap();
  },
}));

/** Hymn 100's page and its own bar, chords on, mounted; it unmounts when the `using` ends. */
const mount = () => {
  const hymn = Option.getOrThrow(hymnAt('100'));
  const reader = readerOn(new Map([['chords', 'true']]));
  const player = playerOn(fakeDevice().layer, Duration.millis(1));
  const registry = AtomRegistry.make();
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() =>
    root.render(
      <RegistryContext value={registry}>
        <ChordReaderContext value={reader}>
          <PlayerContext value={Option.some(player)}>
            <View>
              <Shown hymn={hymn} />
              <HymnPage hymn={hymn} reader={reader} />
              <PageBar track={hymn} />
            </View>
          </PlayerContext>
        </ChordReaderContext>
      </RegistryContext>,
    ),
  );
  const get = (selector: string) =>
    Option.getOrThrow(Option.fromNullishOr(host.querySelector(selector)));
  return {
    get,
    /** The sections the page draws, each a stanza or the refrain. */
    sections: () => host.querySelectorAll('[role="group"][aria-label]').length,
    /** The chord texts the page draws: each change and each chord held over. */
    chordTexts: () =>
      host.querySelectorAll('[data-testid^="chord-"], [data-testid^="held-"]').length,
    /** What one detent of dial `label`, as VoiceOver turns it, drew again on the page. */
    detent: (label: string) => {
      Object.assign(drawn, { sections: 0, lines: 0, chords: 0 });
      perform(get(`[role="slider"][aria-label="${label}"]`), 'increment');
      return { ...drawn };
    },
    [Symbol.dispose]: () => {
      act(() => root.unmount());
      host.remove();
      registry.dispose();
    },
  };
};

describe('a detent of the key or the capo dial', () => {
  it('draws the page’s chord texts again, each once, and no section, line or syllable', () => {
    using page = mount();
    // Every section, line and chord text was drawn once as the page mounted.
    expect(drawn.sections).toBe(page.sections());
    expect(drawn.lines).toBeGreaterThan(10);
    expect(drawn.chords).toBe(page.chordTexts());
    act(() =>
      page
        .get('[role="button"][aria-label="Key"]')
        .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })),
    );
    const texts = page.chordTexts();
    expect(texts).toBeGreaterThan(50);
    for (const label of ['Key', 'Key', 'Capo', 'Capo', 'Key'])
      expect(page.detent(label)).toEqual({ sections: 0, lines: 0, chords: texts });
  });
});
