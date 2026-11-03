import { Schema } from 'effect';
import { type PoseSpec, SAMPLE_SIZE, sample } from '../../core/pose-sample.ts';
import { sha256Hex } from '../digest.ts';
import { encodePng } from '../png.ts';

export const SAMPLES = { train: 400, held: 40 } as const;

type Split = keyof typeof SAMPLES;

const SPLIT_OFFSET: Readonly<Record<Split, number>> = { train: 0, held: 1_000_000 };

const seedOf = (member: string, id: string, split: Split, i: number): number =>
  (Number.parseInt(sha256Hex(`${member}/${id}`).slice(0, 8), 16) + SPLIT_OFFSET[split] + i) >>> 0;

const encoder = new TextEncoder();
const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));

const header = (name: string, size: number) => {
  const block = new Uint8Array(512);
  const put = (at: number, text: string) => block.set(encoder.encode(text), at);
  put(0, name);
  put(100, '0000644\0');
  put(108, '0000000\0');
  put(116, '0000000\0');
  put(124, `${size.toString(8).padStart(11, '0')}\0`);
  put(136, '00000000000\0');
  put(148, '        ');
  put(156, '0');
  put(257, 'ustar\0');
  put(263, '00');
  const sum = block.reduce((s, b) => s + b, 0);
  put(148, `${sum.toString(8).padStart(6, '0')}\0 `);
  return block;
};

const tarOf = (files: ReadonlyArray<readonly [name: string, bytes: Uint8Array]>) => {
  const blocks = files.flatMap(([name, bytes]) => [
    header(name, bytes.length),
    bytes,
    new Uint8Array((512 - (bytes.length % 512)) % 512),
  ]);
  blocks.push(new Uint8Array(1024));
  const out = new Uint8Array(blocks.reduce((n, b) => n + b.length, 0));
  let at = 0;
  for (const b of blocks) {
    out.set(b, at);
    at += b.length;
  }
  return out;
};

export const shardOf = (
  spec: PoseSpec,
  member: string,
  id: string,
  counts: Readonly<Record<Split, number>> = SAMPLES,
): Uint8Array => {
  const files: Array<readonly [string, Uint8Array]> = [];
  for (const split of ['train', 'held'] as const)
    for (let i = 0; i < counts[split]; i++) {
      const seed = seedOf(member, id, split, i);
      const { img, truth } = sample(spec, seed);
      const name = `${member}__${id.replaceAll('/', '-')}__${String(i).padStart(4, '0')}`;
      const json = {
        id: name,
        seed,
        split,
        member,
        drawing: id,
        size: spec.size ?? SAMPLE_SIZE,
        ...truth,
      };
      files.push([`${split}/${name}.png`, encodePng(img)]);
      files.push([`${split}/${name}.json`, encoder.encode(encodeJson(json))]);
    }
  return tarOf(files);
};

export const trainsetOf = (shards: Readonly<Record<string, string>>): Uint8Array =>
  encoder.encode(
    Object.entries(shards)
      .map(([drawing, hash]) => `${drawing}=${hash}`)
      .toSorted()
      .join('\n'),
  );
