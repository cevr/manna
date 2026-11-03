export const RECORDING_SET = 'warm-1';

export interface RecordingSet {
  readonly name: string;
  readonly hymns: 'every' | ReadonlyArray<number>;
}

export const RECORDING_SETS: ReadonlyArray<RecordingSet> = [
  { name: RECORDING_SET, hymns: 'every' },
  { name: 'warm-2', hymns: [663] },
];

export const holdsHymn = (set: RecordingSet, hymn: number) =>
  set.hymns === 'every' || set.hymns.includes(hymn);

export const isRecordingSet = (name: string) => RECORDING_SETS.some((set) => set.name === name);

export const setHolds = (name: string, hymn: number) =>
  RECORDING_SETS.some((set) => set.name === name && holdsHymn(set, hymn));

export const setOf = (hymn: number) =>
  RECORDING_SETS.findLast((set) => holdsHymn(set, hymn))?.name ?? RECORDING_SET;

export const KEY_TRANSPOSES = [1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6] as const;

export const keySet = (set: string, transpose: number) =>
  transpose === 0 ? set : `${set}-${transpose > 0 ? 'up' : 'down'}${Math.abs(transpose)}`;

export const recordingKey = (hymn: number) => `sdah/${hymn}.mp3`;

export interface CreditLine {
  readonly part: string;
  readonly work: string;
  readonly author: string;
  readonly licence: string;
  readonly licenceUrl?: string;
}

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

const creditLine = (line: CreditLine) =>
  `${line.part}: ${line.work} by ${line.author}, ${line.licence}${
    line.licenceUrl === undefined ? '' : ` (${line.licenceUrl})`
  }.`;

export const creditText = () =>
  [RECORDING_CREDITS.lead, ...RECORDING_CREDITS.lines.map(creditLine)].join(' ');
