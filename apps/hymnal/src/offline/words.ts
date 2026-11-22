/** The counts a line of Downloads reads, as the cache's snapshot holds them; below, every line and name the leaf in Settings draws. */
export interface Counts {
  readonly saved: number;
  readonly printed: number;
  readonly bytes: number;
  readonly active: number;
  readonly queued: number;
  readonly partialBytes: number;
  readonly storage: boolean;
}

/** How many printed-key recordings there are to save: one per hymn. */
export const RECORDINGS = 695;
export const PROGRESS_LABEL = 'Downloaded printed-key recordings';
export const megabytes = (bytes: number) => (bytes / 1_000_000).toFixed(2);
export const progressText = (state: Pick<Counts, 'printed'>) =>
  `${state.printed} of ${RECORDINGS} recordings`;
export const sizeLabel = (state: Counts) =>
  `${state.saved} saved · ${state.bytes.toLocaleString()} bytes · ${megabytes(state.bytes)} MB`;
export const sizeText = (state: Counts) => `${state.saved} saved · ${megabytes(state.bytes)} MB`;
export const busyOf = (state: Pick<Counts, 'active' | 'queued'>) => state.active + state.queued > 0;
export const activeLabel = (state: Counts) =>
  `${state.active} downloading · ${state.queued} queued · ${state.partialBytes.toLocaleString()} partial bytes · ${megabytes(state.partialBytes)} MB`;
export const activeText = (state: Counts) =>
  `${state.active} downloading · ${state.queued} queued · ${megabytes(state.partialBytes)} MB partial`;
export const INDEXING =
  'Checking saved recordings. Download all recordings starts when the check ends.';
export const PAUSED =
  'Download paused. Download all recordings resumes unfinished saves and keeps completed recordings.';
export const failureOf = (state: Pick<Counts, 'storage'>) => {
  let failure =
    'Some recordings could not be saved. Check the connection, then choose Download all recordings to retry.';
  if (state.storage)
    failure =
      'Downloads stopped because storage is unavailable. Free space, then choose Download all recordings to retry.';
  return failure;
};
export const estimateText = (estimate: number) =>
  `Estimated total: ${estimate.toLocaleString()} MB for ${RECORDINGS} recordings. Actual size varies. Downloads use mobile data on mobile networks.`;
export const WEB_NOTE =
  'Your browser may remove downloaded recordings. Storage protection is requested when you choose Download all recordings. You can download them again if needed.';
export const IOS_NOTE =
  'Downloaded recordings stay on this device and are excluded from iCloud backup.';
export const DOWNLOAD_ALL = 'Download all recordings';
export const CANCEL = 'Cancel download';
export const DELETE = 'Delete downloads';
export const CONFIRM_QUESTION = 'Delete all downloaded recordings and partial saves from this app?';
export const CONFIRM = 'Confirm delete downloads';
export const KEEP = 'Keep downloads';
