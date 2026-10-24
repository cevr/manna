/**
 * Every chord the page can show, fingered, checked against the guitar by
 * rule and not against the table that fingers it: each hymn's chords, Simple
 * and Advanced, in every key a transpose from -5 to 6 and a capo from 0 to 11
 * reach (the page shows a chord in the played key alone, so each key is
 * walked once). Then the whole vocabulary, a superset: each of the fourteen
 * qualities on each of the twelve roots, alone and over each of the eleven
 * other basses.
 *
 * The rules: the strings sound the chord's tones (and its bass) alone; every
 * tone sounds but the fifth; the lowest string sounding is the bass, or the
 * root when the fingering says it plays the chord over its root; each dot is
 * one finger, 1 to 4; a barre lies at the lowest fret, every string it
 * crosses held at it or above; fingers rise with the frets, but the barre's;
 * no more than four fingers, four frets, and at least four strings sounding.
 */

import { describe, expect, it } from 'bun:test';
import * as Chord from '@bible/hymnal/chord';
import { Option } from 'effect';

import { readChords } from '../../vite/chords';
import { chordBook, type HymnChords, keyName, playedKey } from './chords';
import { type Barre, type Fingering, fingeringOf } from './shapes';
import { simple } from './simple';

const OPEN_STRINGS = [4, 9, 2, 7, 11, 4];
const mod12 = (n: number) => ((n % 12) + 12) % 12;

/** Each quality's tones above its root, written out here apart from the module. */
const TONES: Record<Chord.Quality, ReadonlyArray<number>> = {
  '': [0, 4, 7],
  m: [0, 3, 7],
  '7': [0, 4, 7, 10],
  m7: [0, 3, 7, 10],
  maj7: [0, 4, 7, 11],
  '6': [0, 4, 7, 9],
  m6: [0, 3, 7, 9],
  dim: [0, 3, 6],
  dim7: [0, 3, 6, 9],
  m7b5: [0, 3, 6, 10],
  aug: [0, 4, 8],
  sus4: [0, 5, 7],
  sus2: [0, 2, 7],
  '7sus4': [0, 5, 7, 10],
};

const QUALITIES: ReadonlyArray<Chord.Quality> = Chord.Quality.literals;

/** A chord at pitch level: its root, quality and bass as pitch classes. */
interface Sounding {
  readonly root: number;
  readonly quality: Chord.Quality;
  readonly bass: Option.Option<number>;
}

interface Dot {
  readonly string: number;
  readonly fret: number;
  readonly finger: number;
}

const soundingOf = (c: Chord.Chord, key: Chord.Key): Sounding => {
  const tonic = Chord.pitchClass(key.tonic);
  return {
    root: mod12(tonic + c.root),
    quality: c.quality,
    bass: Option.map(Option.fromUndefinedOr(c.bass), (b) => mod12(tonic + b)),
  };
};

const idOf = (s: Sounding) => `${s.root}${s.quality}/${Option.getOrElse(s.bass, () => -1)}`;

/** The pitch class each sounding string sounds, the low E first. */
const heardOf = (f: Fingering): ReadonlyArray<number> =>
  f.strings.flatMap((play, k) => {
    const open = OPEN_STRINGS[k] ?? 0;
    if (play._tag === 'Muted') return [];
    if (play._tag === 'Open') return [open];
    return [mod12(open + play.fret)];
  });

const dotsOf = (f: Fingering): ReadonlyArray<Dot> =>
  f.strings.flatMap(
    (play, k) =>
      (play._tag === 'Fretted' && [{ string: k, fret: play.fret, finger: play.finger }]) || [],
  );

/** The tones sounded: the chord's alone (and its bass), each but the fifth, over the bass, on four strings or more. */
const toneFaults = (f: Fingering, s: Sounding): ReadonlyArray<string> => {
  const heard = heardOf(f);
  const tones = TONES[s.quality].map((t) => mod12(s.root + t));
  const bass = Option.getOrElse(
    Option.filter(s.bass, () => Option.isNone(f.playedAs)),
    () => s.root,
  );
  return [
    ...heard
      .filter((pc) => !tones.includes(pc) && pc !== bass)
      .map((pc) => `sounds ${pc}, no tone of the chord`),
    ...tones
      .filter((t) => t !== mod12(s.root + 7) && !heard.includes(t))
      .map((t) => `leaves out ${t}`),
    ...((heard[0] !== bass && [`lowest is ${heard[0]}, not the bass ${bass}`]) || []),
    ...((heard.length < 4 && [`${heard.length} strings sound`]) || []),
  ];
};

/** The barre: at the lowest fret, each string it crosses held at it or above, those at its fret by its finger. */
const barreFaults = (f: Fingering, b: Barre, low: number): ReadonlyArray<string> => [
  ...((b.fret !== low && [`barre at ${b.fret}, not the lowest fret ${low}`]) || []),
  ...f.strings.slice(b.from, b.to + 1).flatMap((play, k) => {
    if (play._tag !== 'Fretted' || play.fret < b.fret)
      return [`barre crosses string ${b.from + k}, not held at it`];
    if (play.fret === b.fret && play.finger !== b.finger)
      return [`string ${b.from + k} under the barre takes finger ${play.finger}`];
    return [];
  }),
];

/** The hand: fingers 1 to 4, one string each but the barre's, rising with the frets, within four frets; the box's first fret. */
const handFaults = (f: Fingering): ReadonlyArray<string> => {
  const dots = dotsOf(f);
  if (dots.length === 0) return [];
  const frets = dots.map((d) => d.fret);
  const low = Math.min(...frets);
  const high = Math.max(...frets);
  const barreFinger = Option.match(f.barre, { onNone: () => 0, onSome: (b) => b.finger });
  const others = dots.filter((d) => d.finger !== barreFinger);
  const first = (high <= 4 && 1) || low;
  return [
    ...dots.filter((d) => d.finger < 1 || d.finger > 4).map((d) => `finger ${d.finger}`),
    ...((high - low > 3 && [`spans frets ${low} to ${high}`]) || []),
    ...((new Set(others.map((d) => d.finger)).size !== others.length && [
      'a finger holds two strings, not as a barre',
    ]) ||
      []),
    ...others.flatMap((a) =>
      others
        .filter((b) => a.fret < b.fret && a.finger > b.finger)
        .map((b) => `finger ${a.finger} at fret ${a.fret} above finger ${b.finger} at ${b.fret}`),
    ),
    ...((f.first !== first && [`box starts at ${f.first}, not ${first}`]) || []),
    ...Option.match(f.barre, { onNone: () => [], onSome: (b) => barreFaults(f, b, low) }),
  ];
};

/** The chords one hymn's page shows, keyed by what they sound, in each key a move reaches. */
const chordsOf = (h: HymnChords): ReadonlyArray<Chord.Chord> =>
  [...h.stanzas, ...Option.toArray(h.refrain)].flatMap((part) => {
    if (part._tag !== 'Sung') return [];
    return part.lines.flat(2).flatMap((box) => box.chords);
  });

/** Each chord once, by its degrees. */
const distinct = (chords: ReadonlyArray<Chord.Chord>): ReadonlyArray<Chord.Chord> => [
  ...new Map(chords.map((c) => [`${c.root}${c.quality}/${c.bass}`, c])).values(),
];

/** The keys a move reaches from `key`: a transpose from -5 to 6, less a capo from 0 to 11. */
const keysOf = (key: Chord.Key): ReadonlyArray<Chord.Key> => {
  const moves = Array.from({ length: 12 }, (_, t) => t - 5).flatMap((transpose) =>
    Array.from({ length: 12 }, (_, capo) => playedKey(key, { transpose, capo })),
  );
  return [...new Map(moves.map((played) => [keyName(played), played])).values()];
};

/** Every chord a hymn's page shows, Simple and Advanced, in every key a move reaches, once for each sound. */
const shown = (): ReadonlyArray<readonly [Chord.Chord, Chord.Key]> => {
  const book = chordBook(readChords());
  const out = new Map<string, readonly [Chord.Chord, Chord.Key]>();
  for (const n of Array.from({ length: 695 }, (_, k) => k + 1)) {
    const h = Option.getOrThrow(book.of(n));
    const keys = keysOf(h.key);
    const chords = distinct([...chordsOf(h), ...chordsOf(simple(h))]);
    for (const key of keys) for (const c of chords) out.set(idOf(soundingOf(c, key)), [c, key]);
  }
  return [...out.values()];
};

interface Checked {
  readonly faults: ReadonlyArray<string>;
  readonly fallbacks: ReadonlyArray<string>;
  readonly unfingered: ReadonlyArray<string>;
}

/** Each chord's broken rules, those played over their root instead, and those with no fingering. */
const check = (chords: ReadonlyArray<readonly [Chord.Chord, Chord.Key]>): Checked => {
  const results = chords.map(([c, key]) => {
    const name = Chord.format(c, key);
    return Option.match(fingeringOf(c, key), {
      onNone: () => ({ faults: [], fallbacks: [], unfingered: [name] }),
      onSome: (f) => ({
        faults: [...toneFaults(f, soundingOf(c, key)), ...handFaults(f)].map(
          (fault) => `${name}: ${fault}`,
        ),
        fallbacks: Option.toArray(
          Option.map(f.playedAs, (as) => `${name} played as ${Chord.format(as, key)}`),
        ),
        unfingered: [],
      }),
    });
  });
  return {
    faults: results.flatMap((r) => r.faults),
    fallbacks: results.flatMap((r) => r.fallbacks),
    unfingered: results.flatMap((r) => r.unfingered),
  };
};

/** What the walk saw, printed beside the run. */
const report = (lines: ReadonlyArray<string>) => {
  // oxlint-disable-next-line effect/noGlobals -- the walk prints the count it fingered and each chord played over its root, as the run's record.
  console.log(lines.join('\n'));
};

const KEY_C: Chord.Key = { tonic: 'C', minor: false };

describe('every chord the page shows', () => {
  it('is fingered, by the guitar’s rules', () => {
    const chords = shown();
    const { faults, fallbacks, unfingered } = check(chords);
    report([
      `fingered ${chords.length} distinct chords the page shows; ${fallbacks.length} over their root`,
      ...fallbacks,
    ]);
    expect(unfingered).toEqual([]);
    expect(faults).toEqual([]);
    expect(chords.length).toBeGreaterThan(100);
  });
});

describe('the whole vocabulary', () => {
  const roots = Array.from({ length: 12 }, (_, root) => root);
  const plain = QUALITIES.flatMap((quality) =>
    roots.map((root) => [{ root, quality }, KEY_C] as const),
  );
  const slashes = QUALITIES.flatMap((quality) =>
    roots.flatMap((root) =>
      roots
        .filter((bass) => bass !== root)
        .map((bass) => [{ root, quality, bass }, KEY_C] as const),
    ),
  );

  it('fingers every chord by the rules, a slash chord over its bass or, named, over its root', () => {
    const { faults, fallbacks, unfingered } = check([...plain, ...slashes]);
    report([
      `fingered ${plain.length + slashes.length - unfingered.length} of ${plain.length + slashes.length}; ${fallbacks.length} of ${slashes.length} slash chords over their root`,
    ]);
    expect(unfingered).toEqual([]);
    expect(faults).toEqual([]);
  });

  it('plays the common inversions over their bass', () => {
    const inversions = [
      'C/E',
      'C/G',
      'G/B',
      'G/D',
      'D/F#',
      'D/A',
      'A/C#',
      'F/A',
      'F/C',
      'Am/C',
      'Em/G',
      'E/G#',
    ];
    const named = (symbol: string): Chord.Chord => {
      const [chord = '', bass = ''] = symbol.split('/');
      return {
        root: Chord.pitchClass(chord),
        quality: (chord.endsWith('m') && 'm') || '',
        bass: Chord.pitchClass(bass),
      };
    };
    const played = inversions.filter((symbol) =>
      Option.exists(fingeringOf(named(symbol), KEY_C), (f) => Option.isNone(f.playedAs)),
    );
    expect(played).toEqual(inversions);
  });
});
