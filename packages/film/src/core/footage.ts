import { Option, Schema } from 'effect';
import { type Pcm, toMono } from './audio.ts';
import { Seconds, TakeWord, repoJson } from './schema.ts';
import { Segment } from './segment.ts';

export const FOOTAGE_COPIES = ['mezzanine', 'proxy'] as const;

export type FootageCopy = (typeof FOOTAGE_COPIES)[number];

export const footageHref = (source: string, copy: FootageCopy): string =>
  `/footage/${source}/${copy}.mp4`;

const FOOTAGE_NAME = /^[a-z0-9][a-z0-9.-]*$/;

const FOOTAGE_NAME_RULE =
  'a footage name is lower case letters, digits, dots and dashes, starting with a letter or digit';

export const FootageName = Segment.check(
  Schema.isPattern(FOOTAGE_NAME, { message: FOOTAGE_NAME_RULE }),
);

const isFootageName = (name: string): boolean => FOOTAGE_NAME.test(name);

const TRANSCRIPT_FILE = /^[a-z0-9][a-z0-9.-]*\.json$/;

const TranscriptFile = Schema.String.check(
  Schema.isPattern(TRANSCRIPT_FILE, {
    message: 'a transcript is a file under transcripts/: <name>.<sha12>.json',
  }),
);

export const isTranscriptFile = (file: string): boolean => TRANSCRIPT_FILE.test(file);

const FootageHash = Schema.String.check(
  Schema.isPattern(/^[0-9a-f]{64}$/, {
    message: "an original's sha256 is 64 lower-case hex digits",
  }),
);

export const FOOTAGE_EXT_RULE = 'a dot, then lower-case letters and digits';

export const FootageExt = Schema.String.check(
  Schema.isPattern(/^(\.[a-z0-9]+)?$/, {
    message: `an original's extension is none, or ${FOOTAGE_EXT_RULE}`,
  }),
);

const SHA12 = 12;

export const sourceOf = (name: string, sha256: string): string =>
  `${name}/${sha256.slice(0, SHA12)}`;

type DerivedFile = 'mezzanine.mp4' | 'proxy.mp4' | 'voice.flac' | 'stamp.json';

export const sourceFile = (source: string, file: DerivedFile): string => `${source}/${file}`;

export const copiesIn = (outputs: string): string => `${outputs}/footage`;

export const derivedFile = (
  outputs: string,
  name: string,
  sha256: string,
  file: DerivedFile,
): string => `${copiesIn(outputs)}/${sourceFile(sourceOf(name, sha256), file)}`;

export const FOOTAGE_LOCK_HREF = '/footage/library.lock.json';

export const transcriptHref = (file: string): string => `/footage/transcripts/${file}`;

export const FootageKind = Schema.Literals(['take', 'clip']);
export type FootageKind = typeof FootageKind.Type;

export const FootagePicture = Schema.Struct({
  codec: Schema.String,
  width: Schema.Int,
  height: Schema.Int,
  rotation: Schema.Literals([0, 90, 180, 270]),
  fps: Schema.Finite,
  variable: Schema.Boolean,
  start: Schema.Finite,
});
export type FootagePicture = typeof FootagePicture.Type;

const FootageSound = Schema.Struct({
  codec: Schema.String,
  rate: Schema.Int,
  channels: Schema.Int,
});

export const FootageProbe = Schema.Struct({
  container: Schema.String,
  duration: Seconds,
  picture: FootagePicture,
  sound: Schema.optionalKey(FootageSound),
});
export type FootageProbe = typeof FootageProbe.Type;

export const FootageEntry = Schema.Struct({
  kind: FootageKind,
  sha256: FootageHash,
  bytes: Schema.Int,
  ext: FootageExt,
  probe: FootageProbe,
  transcript: Schema.optionalKey(TranscriptFile),
  licence: Schema.optionalKey(Schema.String),
  credit: Schema.optionalKey(Schema.String),
  source: Schema.optionalKey(Schema.String),
  tags: Schema.optionalKey(Schema.Array(Schema.String)),
});
export type FootageEntry = typeof FootageEntry.Type;

export const FootageLock = Schema.Struct({
  version: Schema.Literal(1),
  footage: Schema.Record(Schema.String, FootageEntry),
}).check(
  Schema.makeFilter((lock) =>
    Object.keys(lock.footage)
      .filter((name) => !isFootageName(name))
      .map((name) => ({ path: ['footage', name], issue: `"${name}": ${FOOTAGE_NAME_RULE}` })),
  ),
);
export type FootageLock = typeof FootageLock.Type;

export const FootageLockJson = repoJson(FootageLock);

export const EMPTY_FOOTAGE_LOCK: FootageLock = { version: 1, footage: {} };

export const originalPath = (name: string, entry: Pick<FootageEntry, 'sha256' | 'ext'>): string =>
  `${sourceOf(name, entry.sha256)}${entry.ext}`;

export const originalKey = (name: string, entry: Pick<FootageEntry, 'sha256' | 'ext'>): string =>
  `footage/${originalPath(name, entry)}`;

export interface FootageRecipe {
  readonly longSide: Option.Option<number>;
  readonly crf: number;
  readonly keyEvery: number;
  readonly fps: number;
}

export const FOOTAGE_RECIPES = {
  mezzanine: { longSide: Option.none(), crf: 16, keyEvery: 1, fps: 30 },
  proxy: { longSide: Option.some(1280), crf: 26, keyEvery: 0.5, fps: 30 },
} satisfies { readonly [K in FootageCopy]: FootageRecipe };

export const FOOTAGE_HINTS = {
  mezzanine: 'detail',
  proxy: 'motion',
} satisfies { readonly [K in FootageCopy]: string };

export const recipeKey = (recipe: FootageRecipe): string =>
  [
    `long=${Option.match(recipe.longSide, { onNone: () => 'source', onSome: String })}`,
    `crf=${recipe.crf}`,
    `key=${recipe.keyEvery}`,
    `fps=${recipe.fps}`,
  ].join(' ');

export const VOICE_RECIPE = 'mono 44100 level-once picture-clock';

export const FootageStamp = Schema.Struct({
  mezzanine: Schema.optionalKey(Schema.String),
  proxy: Schema.optionalKey(Schema.String),
  voice: Schema.optionalKey(Schema.String),
});
export type FootageStamp = typeof FootageStamp.Type;
export const FootageStampJson = repoJson(FootageStamp);

const ENVELOPE_STEP = 0.01;
const ENVELOPE_FLOOR = -90;

export const envelopeOf = (pcm: Pcm): ReadonlyArray<number> => {
  const mono = toMono(pcm);
  const samples = mono.channels[0] ?? new Float32Array(0);
  const step = Math.round(ENVELOPE_STEP * mono.rate);
  return Array.from({ length: Math.ceil(mono.frames / step) }, (_, k) => {
    const from = k * step;
    const to = Math.min(mono.frames, from + step);
    let power = 0;
    for (let i = from; i < to; i += 1) power += (samples[i] ?? 0) ** 2;
    return Math.round(Math.max(ENVELOPE_FLOOR, 10 * Math.log10(power / Math.max(1, to - from))));
  });
};

const FootageTranscript = Schema.Struct({
  source: Schema.String,
  text: Schema.String,
  words: Schema.Array(TakeWord),
  envelope: Schema.Array(Schema.Int),
});
export type FootageTranscript = typeof FootageTranscript.Type;
export const FootageTranscriptJson = repoJson(FootageTranscript);

export const transcriptFile = (name: string, sha256: string, hearing: number): string =>
  [
    name,
    sha256.slice(0, SHA12),
    ...Option.toArray(Option.liftPredicate(String(hearing), () => hearing > 1)),
    'json',
  ].join('.');
