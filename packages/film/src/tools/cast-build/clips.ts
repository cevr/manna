import { Array as Arr, Option, Schema } from 'effect';

export const CLIP_BARS = { heightRatio: 0.03, feetPx: 4, named: 0.9, iou: 0.88, hold: 0.95 };

export const FAL_LIMITS = { member: 5, week: 15 };

export const CLIP_ENDPOINT = 'minimax/h3-max/image-to-video';

const WEEK_MS = 7 * 86_400_000;

const ClipFrame = Schema.Struct({ path: Schema.String, sha256: Schema.String });

export const ClipRequest = Schema.Struct({
  endpoint: Schema.String,
  input: Schema.Struct({
    prompt: Schema.String,
    prompt_expansion_mode: Schema.Literal('disabled'),
    duration: Schema.Literal(5),
    resolution: Schema.Literal('768P'),
    seed: Schema.Int,
  }),
  frames: Schema.Struct({ first: ClipFrame, last: Schema.optionalKey(ClipFrame) }),
});
export interface ClipRequest extends Schema.Schema.Type<typeof ClipRequest> {}

export const ClipProvenance = Schema.Struct({
  ...ClipRequest.fields,
  requestId: Schema.String,
  made: Schema.String,
  usd: Schema.Finite,
  output: Schema.Struct({
    width: Schema.Finite,
    height: Schema.Finite,
    fps: Schema.Finite,
    frames: Schema.Int,
    sha256: Schema.String,
  }),
  map: Schema.Struct({ x0: Schema.Finite, y0: Schema.Finite, scale: Schema.Finite }),
});
export interface ClipProvenance extends Schema.Schema.Type<typeof ClipProvenance> {}

export const LedgerEntry = Schema.Struct({
  at: Schema.String,
  member: Schema.String,
  clip: Schema.String,
  endpoint: Schema.String,
  requestId: Schema.String,
  seconds: Schema.Finite,
  usd: Schema.Finite,
  kept: Schema.Boolean,
  external: Schema.optionalKey(Schema.Literal(true)),
});
export interface LedgerEntry extends Schema.Schema.Type<typeof LedgerEntry> {}

export class ClipMissing extends Schema.TaggedError<ClipMissing>()('ClipMissing', {
  clip: Schema.String,
  reason: Schema.String,
  request: Schema.String,
}) {}

export interface ClipBand {
  readonly from: number;
  readonly to: number;
  readonly iou: number;
  readonly expect: ReadonlyArray<string>;
  readonly named: Readonly<Record<string, number>>;
}

export interface ClipNumbers {
  readonly heightRatio: ReadonlyArray<number>;
  readonly feetPx: ReadonlyArray<number>;
  readonly bands: ReadonlyArray<ClipBand>;
}

type ClipFrame = typeof ClipFrame.Type;

export const clipRequestOf = (o: {
  readonly prompt: string;
  readonly seed: number;
  readonly first: ClipFrame;
  readonly last: Option.Option<ClipFrame>;
}): ClipRequest => ({
  endpoint: CLIP_ENDPOINT,
  input: {
    prompt: o.prompt,
    prompt_expansion_mode: 'disabled',
    duration: 5,
    resolution: '768P',
    seed: o.seed,
  },
  frames: Option.match(o.last, {
    onNone: () => ({ first: { path: o.first.path, sha256: o.first.sha256 } }),
    onSome: (last) => ({
      first: { path: o.first.path, sha256: o.first.sha256 },
      last: { path: last.path, sha256: last.sha256 },
    }),
  }),
});

const band = (b: ClipBand) => `${b.from}-${b.to}`;

interface ClipVerdict {
  readonly pass: boolean;
  readonly fails: ReadonlyArray<string>;
}

interface ClipHolds {
  readonly start: number;
  readonly end: number;
}

export const clipVerdict = (n: ClipNumbers): ClipVerdict => {
  const fails: Array<string> = [];
  const tall = n.heightRatio.filter(
    (r) => !(1 - CLIP_BARS.heightRatio <= r && r <= 1 + CLIP_BARS.heightRatio),
  );
  if (tall.length > 0)
    fails.push(
      `heightRatio: ${tall.length} frames outside 1 ± ${CLIP_BARS.heightRatio} (${tall.join(', ')})`,
    );
  const feet = n.feetPx.filter((f) => !(Math.abs(f) <= CLIP_BARS.feetPx));
  if (feet.length > 0)
    fails.push(`feetPx: ${feet.length} frames past ${CLIP_BARS.feetPx} px (${feet.join(', ')})`);
  for (const b of n.bands)
    if (!(b.iou >= CLIP_BARS.iou)) fails.push(`iou ${band(b)}: ${b.iou} under ${CLIP_BARS.iou}`);
  for (const b of n.bands) {
    if (b.expect.length === 0) continue;
    const count = b.expect.reduce((sum, d) => sum + (b.named[d] ?? 0), 0);
    const frames = b.to - b.from + 1;
    if (!(count / frames >= CLIP_BARS.named))
      fails.push(
        `named ${band(b)}: ${count} of ${frames} frames name ${b.expect.join(' or ')}, under ${CLIP_BARS.named}`,
      );
  }
  return { pass: fails.length === 0, fails };
};

export interface ClipFigure {
  readonly heightRatio: ReadonlyArray<number>;
  readonly feetPx: ReadonlyArray<number>;
  readonly iouFirst: ReadonlyArray<number>;
  readonly iouLast: ReadonlyArray<number>;
}

const Range = Schema.Struct({ min: Schema.Finite, max: Schema.Finite });
const Run = Schema.Struct({ from: Schema.Finite, to: Schema.Finite, drawing: Schema.String });

export const ClipLock = Schema.Struct({
  member: Schema.String,
  clip: Schema.String,
  sha256: Schema.String,
  frames: Schema.Int,
  bands: Schema.Array(
    Schema.Struct({
      from: Schema.Finite,
      to: Schema.Finite,
      expect: Schema.Array(Schema.String),
    }),
  ),
  iou: Schema.Record(Schema.String, Schema.Finite),
  named: Schema.Record(Schema.String, Schema.Record(Schema.String, Schema.Finite)),
  holds: Schema.Struct({ start: Schema.Int, end: Schema.Int }),
  scale: Schema.Struct({ heightRatio: Range, feetPx: Range }),
  runs: Schema.Array(Run),
  pass: Schema.Boolean,
  fails: Schema.Array(Schema.String),
});
export interface ClipLock extends Schema.Schema.Type<typeof ClipLock> {}

interface ClipEntryInput {
  readonly member: string;
  readonly clip: string;
  readonly sha256: string;
  readonly bands: ReadonlyArray<{
    readonly from: number;
    readonly to: number;
    readonly expect: ReadonlyArray<string>;
  }>;
  readonly chain: {
    readonly iou: Readonly<Record<string, number>>;
    readonly named: Readonly<Record<string, Readonly<Record<string, number>>>>;
    readonly runs: ReadonlyArray<typeof Run.Type>;
  };
  readonly figure: ClipFigure;
}

const rangeOf = (xs: ReadonlyArray<number>) => ({
  min: xs.reduce((a, b) => Math.min(a, b), Infinity),
  max: xs.reduce((a, b) => Math.max(a, b), -Infinity),
});

export const clipEntryOf = (o: ClipEntryInput): ClipLock => {
  const frames = o.figure.heightRatio.length;
  const all = { from: 0, to: frames - 1, expect: [] };
  const labelled = [...o.bands, all].map((b) => ({ ...b, label: `${b.from}-${b.to}` }));
  const labels = new Set(labelled.map((b) => b.label));
  const kept = <A>(r: Readonly<Record<string, A>>) =>
    Object.fromEntries(Object.entries(r).filter(([label]) => labels.has(label)));
  const heightRatio = rangeOf(o.figure.heightRatio);
  const feetPx = rangeOf(o.figure.feetPx);
  const verdict = clipVerdict({
    heightRatio: [heightRatio.min, heightRatio.max],
    feetPx: [feetPx.min, feetPx.max],
    bands: labelled.map((b) => ({
      from: b.from,
      to: b.to,
      iou: o.chain.iou[b.label] ?? Number.NaN,
      expect: b.expect,
      named: o.chain.named[b.label] ?? {},
    })),
  });
  return {
    member: o.member,
    clip: o.clip,
    sha256: o.sha256,
    frames,
    bands: o.bands.map((b) => ({ from: b.from, to: b.to, expect: [...b.expect] })),
    iou: kept(o.chain.iou),
    named: kept(o.chain.named),
    holds: holdsOf(o.figure.iouFirst, o.figure.iouLast),
    scale: { heightRatio, feetPx },
    runs: o.chain.runs,
    pass: verdict.pass,
    fails: verdict.fails,
  };
};

export const holdsOf = (
  iouFirst: ReadonlyArray<number>,
  iouLast: ReadonlyArray<number>,
): ClipHolds => {
  const moved = (x: number) => !(x >= CLIP_BARS.hold);
  return {
    start: Option.getOrElse(Arr.findFirstIndex(iouFirst, moved), () => iouFirst.length),
    end: iouLast.length - 1 - Option.getOrElse(Arr.findLastIndex(iouLast, moved), () => -1),
  };
};

export const falSpendAllowed = (
  ledger: ReadonlyArray<LedgerEntry>,
  member: string,
  usd: number,
  now: number,
): boolean => {
  const sum = (entries: ReadonlyArray<LedgerEntry>) => entries.reduce((s, e) => s + e.usd, 0);
  const mine = sum(ledger.filter((e) => e.member === member));
  const week = sum(ledger.filter((e) => Date.parse(e.at) > now - WEEK_MS));
  return mine + usd <= FAL_LIMITS.member && week + usd <= FAL_LIMITS.week;
};

const decodeProvenance = Schema.decodeUnknownOption(ClipProvenance);
const RequestJson = Schema.fromJsonString(ClipRequest);
const encodeRequest = Schema.encodeSync(RequestJson);
const requestText = (r: ClipRequest) =>
  encodeRequest({ endpoint: r.endpoint, input: r.input, frames: r.frames });

interface Adopt {
  readonly _tag: 'Adopt';
  readonly provenance: ClipProvenance;
}

export const adoptClip = (
  clip: string,
  request: ClipRequest,
  found: { readonly provenance?: unknown; readonly mp4Sha256?: string },
): Adopt | ClipMissing => {
  const missing = (reason: string) =>
    ClipMissing.make({ clip, reason, request: requestText(request) });
  const ofMp4 = (p: ClipProvenance): Adopt | ClipMissing =>
    Option.match(Option.fromUndefinedOr(found.mp4Sha256), {
      onNone: () => missing('no mp4 is committed'),
      onSome: (sha256): Adopt | ClipMissing => {
        if (sha256 !== p.output.sha256)
          return missing(`the committed mp4 is ${sha256}, the provenance names ${p.output.sha256}`);
        return { _tag: 'Adopt', provenance: p };
      },
    });
  const ofProvenance = (p: ClipProvenance) => {
    if (requestText(p) !== requestText(request))
      return missing(`the committed provenance was made for another request: ${requestText(p)}`);
    return ofMp4(p);
  };
  return Option.match(Option.fromUndefinedOr(found.provenance), {
    onNone: () => missing('no provenance is committed'),
    onSome: (raw) =>
      Option.match(decodeProvenance(raw), {
        onNone: () => missing('the committed provenance is not a clip provenance'),
        onSome: ofProvenance,
      }),
  });
};
