/* oxlint-disable effect/noTernary -- Exact's app folder cannot import effect (docs/exact.md): plain words over plain records. */

/** How the reader names a pack: in the status line while it is on its way, once it lands, and in its own feature while it is missing. */
export interface PackWords {
  readonly name: string;
  /** In "Getting …": "Ellen White's commentary". */
  readonly title: string;
  /** In "… is on this phone now.": "Commentary". */
  readonly noun: string;
  /** What the pack's own feature says while it is missing. */
  readonly waiting: string;
}

/** How long the landed line shows: 3 seconds (the contract's `after`, held to this by `sources.test.ts`). */
export const LANDED_MS = 3000;

/** `words` joined as a sentence lists them: "a", "a and b", "a, b and c". */
const listed = (words: ReadonlyArray<string>): string =>
  words.length < 2
    ? (words[0] ?? '')
    : `${words.slice(0, -1).join(', ')} and ${words.at(-1) ?? ''}`;

/** The quiet line while `missing` are on their way: "Getting Ellen White's commentary…". */
export const gettingLine = (missing: ReadonlyArray<PackWords>): string =>
  `Getting ${listed(missing.map((pack) => pack.title))}…`;

/** The line for `LANDED_MS` once `landed` first land: "Commentary is on this phone now.". */
export const landedLine = (landed: ReadonlyArray<PackWords>): string =>
  `${listed(landed.map((pack) => pack.noun))} ${landed.length === 1 ? 'is' : 'are'} on this phone now.`;

/** The one status of every download. */
export interface PacksState {
  /** `ready` (every pack kept), `fetching`, `failed` (a pack missing, and the last try failed), `none` (a pack missing, never fetched in this launch). */
  phase: string;
  /** How many packs are missing. */
  missing: number;
  /** The quiet line at the chapter's foot: while a pack is on its way, the landed line for a moment, else empty. */
  foot: string;
  /** Whether Try again shows. */
  retry: boolean;
}

/**
 * The one status of every download (q126): one quiet line for every pack
 * still missing, with one Try again, from the packs missing, a fetch in
 * flight, the last try failed, and the packs that just landed first. Only
 * a missing pack is ever shown: with a pack kept, its update, or a failed
 * one, says nothing.
 */
export const packsShownOf = (
  missing: ReadonlyArray<PackWords>,
  busy: boolean,
  failed: boolean,
  landed: ReadonlyArray<PackWords>,
): PacksState => {
  const count = missing.length;
  if (count === 0)
    return {
      phase: 'ready',
      missing: 0,
      foot: landed.length > 0 ? landedLine(landed) : '',
      retry: false,
    };
  if (busy) return { phase: 'fetching', missing: count, foot: gettingLine(missing), retry: false };
  if (failed) return { phase: 'failed', missing: count, foot: '', retry: true };
  return { phase: 'none', missing: count, foot: gettingLine(missing), retry: false };
};

/** One pack, as the feature that reads it is shown it. */
export interface PackState {
  /** `none`, `fetching`, `ready` (the pack is kept), `failed` (missing, and the last try failed). */
  phase: string;
  /** The kept version: the reader's `mark`. */
  version: string;
  /** What the feature says while the pack is missing: empty when ready. */
  line: string;
  /** Whether Try again shows. */
  retry: boolean;
}

/** One pack's state, from its kept version, a fetch in flight, and the last try failed. */
export const packShownOf = (
  words: PackWords,
  version: string,
  busy: boolean,
  failed: boolean,
): PackState => {
  if (version !== '') return { phase: 'ready', version, line: '', retry: false };
  if (busy) return { phase: 'fetching', version, line: words.waiting, retry: false };
  if (failed) return { phase: 'failed', version, line: words.waiting, retry: true };
  return { phase: 'none', version, line: words.waiting, retry: false };
};
