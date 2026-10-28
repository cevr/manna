/* oxlint-disable effect/noGlobals -- the test runs a Bun script in a process of its own, so its React Native stand-in never reaches the other tests. */

/**
 * The phones' hymn list keeps its rows on screen and reuses their views, so
 * a value a row reads from outside its item reaches the rows only if the
 * list is told. Each case changes one such value while the list is mounted
 * (`src/test/phone-list.tsx`) and holds the rows on screen to what a list
 * mounted under the new value draws.
 */

import { describe, expect, it } from 'bun:test';

import { pinnedAt, topicStarts } from './pin';
import { rowsOf } from './rows';

interface Rows {
  readonly hymns: Readonly<
    Record<string, { readonly href: string; readonly colour: string; readonly height: string }>
  >;
  readonly topics: Readonly<Record<string, { readonly height: string }>>;
}

interface Seen {
  readonly before: Rows;
  readonly live: Rows;
  readonly fresh: Rows;
}

type Change = 'scheme' | 'fontScale' | 'hrefOf';

/** A search result's row: its name, its height, and how many found lines it draws. */
interface Found {
  readonly name: string;
  readonly height: string;
  readonly line: number;
}

/** A list's end at a bottom inset: its rows' frame, the last row drawn, and the space after them. */
interface End {
  readonly bottom: number;
  readonly rows: number;
  readonly frame: ReadonlyArray<number>;
  readonly lastDrawn: number;
  readonly space: ReadonlyArray<number>;
}

const run = Bun.spawnSync(['bun', Bun.resolveSync('../test/phone-list.tsx', import.meta.dir)], {
  stderr: 'pipe',
});
const seen: Partial<Record<Change, Seen>> & {
  readonly end?: ReadonlyArray<End>;
  readonly found?: ReadonlyArray<ReadonlyArray<Found>>;
  readonly about?: {
    readonly rows: ReadonlyArray<number | string>;
    readonly sections: ReadonlyArray<string>;
  };
} = JSON.parse(run.stdout.toString() || '{}');

/** The rows of `kind` on screen both live and fresh, by label, as each draws them. */
const shared = (rows: Seen, kind: keyof Rows) => {
  const labels = Object.keys(rows.live[kind]).filter((label) => label in rows.fresh[kind]);
  return {
    labels,
    before: labels.map((label) => rows.before[kind][label]),
    live: labels.map((label) => rows.live[kind][label]),
    fresh: labels.map((label) => rows.fresh[kind][label]),
  };
};

const empty: Rows = { hymns: {}, topics: {} };

describe('the phones’ hymn list, changed while mounted', () => {
  it('mounts and changes with nothing on its error stream', () => {
    expect(run.stderr.toString()).toBe('');
    expect(Object.keys(seen)).toEqual(['about', 'scheme', 'fontScale', 'hrefOf', 'end', 'found']);
  });

  it.each<Change>(['scheme', 'fontScale', 'hrefOf'])(
    'draws its rows on screen after a change of %s as a list mounted under it does',
    (change) => {
      const rows = seen[change] ?? { before: empty, live: empty, fresh: empty };
      const hymns = shared(rows, 'hymns');
      const topics = shared(rows, 'topics');
      expect(hymns.labels.length).toBeGreaterThan(10);
      expect(topics.labels.length).toBeGreaterThan(0);
      expect(hymns.live).toEqual(hymns.fresh);
      expect(topics.live).toEqual(topics.fresh);
      // The change shows: no hymn row on screen still draws as it did before
      // it (a topic row reads only its height).
      expect(hymns.live.filter((row, i) => Bun.deepEquals(row, hymns.before[i]))).toEqual([]);
    },
  );
});

describe('the home list’s pinned row under the field shown over its top', () => {
  const covered = Bun.spawnSync(
    ['bun', Bun.resolveSync('../test/phone-list.tsx', import.meta.dir), 'cover'],
    { stderr: 'pipe' },
  );
  const steps: ReadonlyArray<{
    readonly scroll: number;
    readonly cover: number;
    readonly line: number;
    readonly y: number;
    readonly topic: number;
  }> = JSON.parse(covered.stdout.toString() || '{}').cover ?? [];
  // The script's forty hymns in two topics, under a header 100 pt tall.
  const fixture = Array.from({ length: 40 }, (_, i) => ({
    number: i + 1,
    topic: `Topic ${Math.floor(i / 20) + 1}`,
  }));
  const starts = topicStarts(
    rowsOf(fixture).rows,
    100,
    (kind) => ({ topic: 36, shelf: 36, hymn: 44 })[kind],
  );

  it('mounts and covers with nothing on its error stream', () => {
    expect(covered.stderr.toString()).toBe('');
    expect(steps.map((step) => [step.scroll, step.cover])).toEqual([
      [990, 0],
      [990, 26],
      [990, 52],
    ]);
  });

  it('draws the pin’s line at the cover’s bottom, its topic and push as the pin’s rule gives them there', () => {
    // At 990 the second topic's row is 26 pt under the bare top: the cover alone moves the pin onto it.
    expect(steps.map((step) => step.line)).toEqual([0, 26, 52]);
    for (const step of steps) {
      const pinned = pinnedAt(starts, step.scroll, 36, step.cover);
      expect([step.topic, step.y]).toEqual([pinned.index, pinned.y]);
    }
    expect(steps.map((step) => step.topic)).toEqual([0, 1, 1]);
    expect(steps[0]?.y).toBe(-10);
  });
});

describe('the phones’ hymn list, at its end', () => {
  const ends = seen.end ?? [];

  it('keeps at least the bottom inset and 24 pt after its last row, by topic and as three results', () => {
    expect(ends.map(({ bottom, rows }) => [bottom, rows])).toEqual([
      [34, 40],
      [0, 40],
      [34, 3],
    ]);
    for (const end of ends) {
      expect(end.space).toHaveLength(1);
      expect(end.space[0]).toBeGreaterThanOrEqual(end.bottom + 24);
    }
  });

  it('puts the space after the rows, which keep their fixed sizes', () => {
    // Forty hymn rows of 44 pt under two topic rows of 36 pt; three results of 44 pt.
    expect(ends.map((end) => end.frame)).toEqual([[1832], [1832], [132]]);
    // Every result is drawn, and the last one ends where the rows' frame does.
    expect(ends[2]?.lastDrawn).toBe(132);
  });

  it('keeps the same space for the same inset, whatever the list holds', () => {
    expect(ends[0]?.space).toEqual(ends[2]?.space ?? []);
  });
});

describe('a search’s results on a phone', () => {
  const [usual = [], large = []] = seen.found ?? [];

  it('draw the line a result was found by under its title, in a taller row, and name it last', () => {
    expect(usual.map((row) => [row.line, row.height])).toEqual([
      [0, '44px'],
      [1, '56px'],
      [0, '44px'],
    ]);
    expect(usual[1]?.name).toBe('2, Hymn 2, A line found');
    expect(usual[0]?.name).toBe('1, Hymn 1');
  });

  it('scale both lines of a found row with the reader’s text size', () => {
    // At 150%: 33 + 22 for a plain row, 33 + 27 + 16 for a found one.
    expect(large.map((row) => row.height)).toEqual(['55px', '76px', '55px']);
  });
});

describe('a search’s results with the hymns about it', () => {
  it('draw the strongest five, then Hymns about this without the one among them, then More matches, each section a topic’s height', () => {
    expect(seen.about).toEqual({
      rows: [1, 2, 3, 4, 5, 'Hymns about this', 10, 'More matches', 6, 7],
      sections: ['36px', '36px'],
    });
  });
});
