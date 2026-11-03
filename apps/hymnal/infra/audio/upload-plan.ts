import { Array as Arr, Data, Option } from 'effect';
import { RECORDING_SETS, isRecordingSet, recordingKey, setHolds } from '@manna/hymnal/recordings';
import type { ManifestHymn, RecordingManifest } from '@manna/hymnal/recording-manifest';

import { SDAH_HYMNS, holds } from './plan.ts';
import type { TargetObject } from './stores.ts';

export const SET_CACHE_CONTROL = 'public, max-age=31536000, immutable';

export const setKey = (set: string, hymn: number) => `audio/${set}/${recordingKey(hymn)}`;

export const setPrefix = (set: string) => `audio/${set}/sdah/`;

export type UploadItem = Data.TaggedEnum<{
  Keep: { readonly hymn: ManifestHymn; readonly key: string };
  Upload: { readonly hymn: ManifestHymn; readonly key: string };
  Conflict: { readonly hymn: ManifestHymn; readonly key: string; readonly held: TargetObject };
}>;
export const UploadItem = Data.taggedEnum<UploadItem>();

export const manifestRefusals = (manifest: RecordingManifest): ReadonlyArray<string> => {
  const known = isRecordingSet(manifest.set);
  const held = SDAH_HYMNS.filter((n) => setHolds(manifest.set, n));
  const numbers = manifest.hymns.map((h) => h.hymn);
  const missing = held.filter((n) => !numbers.includes(n));
  const extra = numbers.filter((n, k) => !held.includes(n) || numbers.indexOf(n) !== k);
  const miskeyed = manifest.hymns.filter((h) => h.key !== recordingKey(h.hymn)).map((h) => h.hymn);
  const failed = manifest.hymns.filter((h) => !h.passed).map((h) => h.hymn);
  const list = (hymns: ReadonlyArray<number>) =>
    [
      hymns.slice(0, 12).join(', '),
      ...Arr.of(`and ${hymns.length - 12} more`).filter(() => hymns.length > 12),
    ].join(' ');
  const checks: ReadonlyArray<readonly [boolean, () => string]> = [
    [
      !known,
      () =>
        `the set is ${manifest.set}, the app plays ${RECORDING_SETS.map((s) => s.name).join(', ')}`,
    ],
    [
      known && manifest.hymns.length !== held.length,
      () => `the manifest has ${manifest.hymns.length} hymns, not ${held.length}`,
    ],
    [known && missing.length > 0, () => `missing hymns ${list(missing)}`],
    [
      known && extra.length > 0,
      () => `hymns outside the set ${manifest.set} or twice: ${list(extra)}`,
    ],
    [miskeyed.length > 0, () => `hymns whose key is not sdah/<n>.mp3: ${list(miskeyed)}`],
    [failed.length > 0, () => `hymns that did not pass their checks: ${list(failed)}`],
  ];
  return checks.filter(([refused]) => refused).map(([, reason]) => reason());
};

export const planUpload = (
  manifest: RecordingManifest,
  listing: ReadonlyMap<string, TargetObject>,
): ReadonlyArray<UploadItem> =>
  [...manifest.hymns]
    .sort((a, b) => a.hymn - b.hymn)
    .map((hymn) => {
      const key = setKey(manifest.set, hymn.hymn);
      return Option.match(Option.fromUndefinedOr(listing.get(key)), {
        onNone: () => UploadItem.Upload({ hymn, key }),
        onSome: (held) => {
          if (holds(held, hymn.bytes, hymn.md5)) return UploadItem.Keep({ hymn, key });
          return UploadItem.Conflict({ hymn, key, held });
        },
      });
    });
