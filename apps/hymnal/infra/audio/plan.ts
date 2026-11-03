import { Array as Arr, Data, Option, Result } from 'effect';

import { sourcedKey } from '../../src/remote.ts';
import type { FillEntry, SourceHead, TargetObject } from './stores.ts';

export const SDAH_HYMNS: ReadonlyArray<number> = Arr.range(1, 695);

export const AUDIO_PREFIX = 'audio/sdah/';

export type Head = Data.TaggedEnum<{
  Present: { readonly head: SourceHead };
  Absent: {};
  Unanswered: { readonly reason: string };
}>;
export const Head = Data.taggedEnum<Head>();

export type Item = Data.TaggedEnum<{
  FromS3: {
    readonly hymn: number;
    readonly key: string;
    readonly size: number;
    readonly md5: Option.Option<string>;
    readonly existing: Option.Option<TargetObject>;
  };
  FromGitHub: {
    readonly hymn: number;
    readonly key: string;
    readonly entry: FillEntry;
    readonly existing: Option.Option<TargetObject>;
  };
  Keep: {
    readonly hymn: number;
    readonly key: string;
    readonly size: number;
    readonly md5: string;
  };
  Missing: { readonly hymn: number; readonly key: string };
  Unreadable: { readonly hymn: number; readonly key: string; readonly reason: string };
}>;
export const Item = Data.taggedEnum<Item>();

export const unquote = (etag: string) => etag.replaceAll('"', '');

export const etagMd5 = (etag: string): Option.Option<string> => {
  const bare = unquote(etag).toLowerCase();
  if (bare.includes('-')) return Option.none();
  return Option.some(bare);
};

export const holds = (object: TargetObject, size: number, md5: string) =>
  object.size === size && unquote(object.etag).toLowerCase() === md5;

const fromS3 = (hymn: number, head: SourceHead, existing: Option.Option<TargetObject>): Item => {
  const key = sourcedKey(hymn);
  const md5 = etagMd5(head.etag);
  const kept = Option.flatMap(md5, (sum) =>
    Option.filter(existing, (object) => holds(object, head.size, sum)),
  );
  if (Option.isSome(kept) && Option.isSome(md5)) {
    return Item.Keep({ hymn, key, size: head.size, md5: md5.value });
  }
  return Item.FromS3({ hymn, key, size: head.size, md5, existing });
};

const fromFill = (
  hymn: number,
  fill: Result.Result<ReadonlyMap<number, FillEntry>, string>,
  existing: Option.Option<TargetObject>,
): Item => {
  const key = sourcedKey(hymn);
  return Result.match(fill, {
    onFailure: (reason) => Item.Unreadable({ hymn, key, reason: `absent from s3, ${reason}` }),
    onSuccess: (entries) =>
      Option.match(Option.fromUndefinedOr(entries.get(hymn)), {
        onNone: () => Item.Missing({ hymn, key }),
        onSome: (entry) => Item.FromGitHub({ hymn, key, entry, existing }),
      }),
  });
};

export const plan = (
  heads: ReadonlyMap<number, Head>,
  fill: Result.Result<ReadonlyMap<number, FillEntry>, string>,
  target: ReadonlyMap<string, TargetObject>,
): ReadonlyArray<Item> =>
  SDAH_HYMNS.map((hymn) => {
    const existing = Option.fromUndefinedOr(target.get(sourcedKey(hymn)));
    const head = Option.getOrElse(Option.fromUndefinedOr(heads.get(hymn)), () =>
      Head.Unanswered({ reason: 'not asked' }),
    );
    return Head.$match(head, {
      Present: ({ head: present }) => fromS3(hymn, present, existing),
      Absent: () => fromFill(hymn, fill, existing),
      Unanswered: ({ reason }) => Item.Unreadable({ hymn, key: sourcedKey(hymn), reason }),
    });
  });

export const needsFill = (heads: ReadonlyMap<number, Head>) =>
  Arr.some([...heads.values()], Head.$is('Absent'));
