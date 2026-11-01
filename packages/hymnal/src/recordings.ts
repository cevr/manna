/**
 * The hymn recordings the app plays: the sets they belong to, the set each
 * hymn plays from, each hymn's key inside a set, and the credit their
 * instruments ask for. It imports nothing, so the app's bundlers and the
 * infra read it unchanged.
 *
 * A set is rendered once (`scripts/render/`) and never replaced: a hymn
 * whose sound changes is rendered into a later set that holds it alone (or
 * with the others that changed), uploaded beside the old one, and the hymn
 * plays from the latest set that holds it.
 */

/** The first set: style C, "Warm band", every hymn 1 to 695. */
export const RECORDING_SET = 'warm-1';

/** A set the app plays from: its name and the hymns it holds. */
export interface RecordingSet {
  readonly name: string;
  /** `every` for the first set (hymns 1 to 695); a later set holds exactly these hymns. */
  readonly hymns: 'every' | ReadonlyArray<number>;
}

/**
 * Every set, oldest first. `warm-2` holds hymn 663, whose file plays one
 * verse for its six stanzas: rendered again on its sung file
 * (`src/sung.ts`), the verse once a stanza.
 */
export const RECORDING_SETS: ReadonlyArray<RecordingSet> = [
  { name: RECORDING_SET, hymns: 'every' },
  { name: 'warm-2', hymns: [663] },
];

/** Whether `set` holds `hymn`: the first set holds every hymn. */
export const holdsHymn = (set: RecordingSet, hymn: number) =>
  set.hymns === 'every' || set.hymns.includes(hymn);

/** Whether the app plays from a set named `name`. */
export const isRecordingSet = (name: string) => RECORDING_SETS.some((set) => set.name === name);

/** Whether the set named `name` holds `hymn`: false for a set the app does not play. */
export const setHolds = (name: string, hymn: number) =>
  RECORDING_SETS.some((set) => set.name === name && holdsHymn(set, hymn));

/** The set hymn `hymn` plays from: the latest that holds it. */
export const setOf = (hymn: number) =>
  RECORDING_SETS.findLast((set) => holdsHymn(set, hymn))?.name ?? RECORDING_SET;

/** The latest set: a name that changes whenever a set is added. */
export const LATEST_SET = RECORDING_SETS.at(-1)?.name ?? RECORDING_SET;

/**
 * The keys the app's Key stepper reaches besides the printed one, in the
 * order they are rendered: the smallest steps first, so the most used keys
 * arrive first.
 */
export const KEY_TRANSPOSES = [1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6] as const;

/**
 * The set `set` moved `transpose` semitones: `warm-1-up2`, `warm-2-down3`;
 * 0 is `set` itself. No name holds a `+`.
 */
export const keySet = (set: string, transpose: number) =>
  transpose === 0 ? set : `${set}-${transpose > 0 ? 'up' : 'down'}${Math.abs(transpose)}`;

/** A hymn's key inside a set: the 1985 SDA Hymnal's number, unpadded. */
export const recordingKey = (hymn: number) => `sdah/${hymn}.mp3`;

/** One instrument's credit: what it plays, the work, its author and its licence. */
export interface CreditLine {
  readonly part: string;
  readonly work: string;
  readonly author: string;
  readonly licence: string;
  /** The licence's address, written out where the licence asks for it (CC BY). */
  readonly licenceUrl?: string;
}

/**
 * Who made the sounds, as the licences ask: the Salamander piano is CC BY 3.0
 * and must be credited with its licence's address; the strings are CC0 and
 * are credited anyway.
 */
export const RECORDING_CREDITS = {
  lead: "The recordings are played from the hymnal's own scores.",
  lines: [
    {
      part: 'Piano',
      work: 'Salamander Grand Piano V3',
      author: 'Alexander Holm',
      licence: 'CC BY 3.0',
      licenceUrl: 'https://creativecommons.org/licenses/by/3.0/',
    },
    {
      part: 'Strings',
      work: 'VS Chamber Orchestra 2: Community Edition',
      author: 'Versilian Studios',
      licence: 'CC0 1.0',
    },
  ],
} as const satisfies { readonly lead: string; readonly lines: ReadonlyArray<CreditLine> };

/** One credit line as a sentence: "Piano: Salamander Grand Piano V3 by Alexander Holm, CC BY 3.0 (…)." */
const creditLine = (line: CreditLine) =>
  `${line.part}: ${line.work} by ${line.author}, ${line.licence}${
    line.licenceUrl === undefined ? '' : ` (${line.licenceUrl})`
  }.`;

/** Every credit as one text, the lead first: what each MP3 carries as its comment. */
export const creditText = () =>
  [RECORDING_CREDITS.lead, ...RECORDING_CREDITS.lines.map(creditLine)].join(' ');
