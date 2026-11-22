/* oxlint-disable effect/noGlobals -- a Bun test writing the current app's store as the JSON text its `Atom.kvs` keeps. */

/**
 * Each hymn's own chord placement is the current hymnal's: for generated
 * kept texts, a hymn's placement as the port reads it (`effectiveOf`,
 * `ownOf`) is what the current app's own `effectivePlacement` and
 * `placementFor` atoms give over a store holding the same texts under its
 * keys (`chords.placement.<n>`, `chords.placement`), a text no placement is
 * among them. The dial's stops, marks and labels are the current
 * `placements`, in its order; `keptWith` keeps every other hymn's choice
 * and drops the hymn's own at `inherit`.
 */

import { describe, expect, it } from 'bun:test';
import type * as Atom from 'effect/reactivity/Atom';
import * as AtomRegistry from 'effect/reactivity/AtomRegistry';

import { placements } from '@manna/hymnal-app/chord-choices';

import { currentSettings } from '../test/kept.testing.ts';
import { pick, seeded } from '../test/random.ts';
import type { Placement } from '../settings/chords.ts';
import { effectiveOf, keptWith, type Own, ownOf, placementDialOf } from './placement.ts';

/** The part of the current app's settings this test runs. */
interface Placements {
  readonly placementFor: (number: number) => Atom.Atom<Own>;
  readonly effectivePlacement: (number: number) => Atom.Atom<Placement>;
}

const TEXTS = ['beat', 'simpler', 'file', 'inherit', '', 'x', 'Beat', 'file '] as const;
const HYMNS = [1, 2, 3, 100, 373, 695] as const;

describe('a hymn’s own placement is the current app’s', () => {
  it('for generated kept texts, the port reads what the current atoms give', () => {
    const random = seeded(73);
    for (let run = 0; run < 120; run++) {
      const kept: Array<string> = [];
      const device = new Map<string, string>();
      for (const n of HYMNS)
        if (random() < 0.6) {
          const text = pick(random, TEXTS);
          kept.push(`${n}:${text}`);
          device.set(`chords.placement.${n}`, JSON.stringify(text));
        }
      const global = pick(random, TEXTS);
      if (global !== '') device.set('chords.placement', JSON.stringify(global));
      const settings = currentSettings<Placements>(device);
      const registry = AtomRegistry.make();
      for (const n of HYMNS) {
        expect(effectiveOf(kept, n, global)).toBe(registry.get(settings.effectivePlacement(n)));
        expect(ownOf(kept, n)).toBe(registry.get(settings.placementFor(n)));
      }
      registry.dispose();
    }
  });

  it('keeps every other hymn’s choice, and drops the hymn’s own at inherit', () => {
    const random = seeded(19);
    for (let run = 0; run < 200; run++) {
      const kept = HYMNS.filter(() => random() < 0.5).map(
        (n) => `${n}:${pick(random, ['beat', 'simpler', 'file'])}`,
      );
      const n = pick(random, HYMNS);
      const own = pick(random, TEXTS);
      const after = keptWith(kept, n, own);
      for (const other of HYMNS)
        if (other !== n) expect(ownOf(after, other)).toBe(ownOf(kept, other));
      const placement = placements.find((choice) => choice.value === own)?.value;
      expect(ownOf(after, n)).toBe(placement ?? 'inherit');
      expect(after.length).toBeLessThanOrEqual(HYMNS.length);
    }
  });

  it('draws the dial’s stops, marks and labels as the current `placements`', () => {
    const dial = placementDialOf(['373:file'], 373, 'simpler', true);
    expect(dial.stops).toEqual(placements.map(({ value, mark }) => ({ value, mark })));
    expect(dial.index).toBe(placements.findIndex((choice) => choice.value === 'file'));
    expect(dial.said).toBe(placements.find((choice) => choice.value === 'file')?.label ?? '');
    expect(dial.inherit).toBe(false);
    expect(dial.global).toBe(placements.find((choice) => choice.value === 'simpler')?.label ?? '');
    const inherits = placementDialOf([], 1, '', false);
    expect(inherits.inherit).toBe(true);
    expect(inherits.said).toBe(placements[0]?.label ?? '');
    expect(inherits.has).toBe(false);
  });
});
