/**
 * The natural voice's download, pinned: Kokoro-82M's seven Core ML stages
 * and the `af_heart` voice from FluidInference `kokoro-82m-coreml`, folder
 * `ANE/`, at one revision, and the `bm_george` voice converted from the
 * same revision's rows. The app fetches exactly these files and checks
 * each one's SHA-256, so a wrong or tampered file is refused whoever
 * serves it.
 */

import { Option } from 'effect';

import type { ModelFile } from './module';

/** The Hugging Face revision the files were taken from. */
export const SOURCE_REVISION = '2568276a60ff6e7f312afce3dc9e3f07521cb48d';

/** The revision's short name: the folder the files live in, on the mirror and on the phone. */
export const REVISION = '2568276a60ff';

/** Heartseed's own mirror of the pinned files. */
export const MIRROR = `https://models.heartseed.app/kokoro/${REVISION}/`;

/**
 * The second voice's pack, `bm_george`: converted from the revision's
 * `voices/bm_george.json` (its rows as little-endian fp32), since the
 * revision's `ANE/` folder ships only `af_heart.bin`.
 */
export const BM_GEORGE: ModelFile = {
  path: 'bm_george.bin',
  bytes: 522_240,
  sha256: 'c4b235a4c1f2cd3b939fed08b899ce9385638b763f7b73a59616c4fc9bd6c9bc',
};

/** The voices the download holds; a voice's pack is the file `<voice>.bin` of `FILES`. */
export const VOICES = ['af_heart', 'bm_george'] as const;

/** A voice the natural module reads with. */
export type NaturalVoice = (typeof VOICES)[number];

/**
 * Each voice's reading speed, Kokoro's duration scale (1 is its own pace):
 * the owner's choice on hearing them (Her 0.85, Him 0.9). The chain reads
 * the number it is sent; no speed lives in the Swift.
 */
export const SPEEDS: Readonly<Record<NaturalVoice, number>> = { af_heart: 0.85, bm_george: 0.9 };

/** The 39 files, in path order, the order they are fetched, each with its size and SHA-256. */
export const FILES: ReadonlyArray<ModelFile> = [
  {
    path: 'KokoroAlbert.mlmodelc/analytics/coremldata.bin',
    bytes: 243,
    sha256: '14a61873d8759a38b79c93f9021ae865f408f56301209a0168dbfc2283265ccd',
  },
  {
    path: 'KokoroAlbert.mlmodelc/coremldata.bin',
    bytes: 433,
    sha256: '70b6d2f8429229f6800dda9480341669f7ac0eabf05a82934d8632ab2b4b63a6',
  },
  {
    path: 'KokoroAlbert.mlmodelc/metadata.json',
    bytes: 2_480,
    sha256: 'fe1d005481f646707a948267ac089dfb2cd2ccea7d5827a14c28587eb4c89930',
  },
  {
    path: 'KokoroAlbert.mlmodelc/model.mil',
    bytes: 101_485,
    sha256: '2038154d06a20e399a8ae35ec5c9242702cb23db8dd24dde7679cd53708e4eae',
  },
  {
    path: 'KokoroAlbert.mlmodelc/weights/weight.bin',
    bytes: 5_718_848,
    sha256: '36089a39359b800d3e2c60e5e8ac9217d8f2d1010a8b9273192290e621f1fabc',
  },
  {
    path: 'KokoroAlignment.mlmodelc/analytics/coremldata.bin',
    bytes: 243,
    sha256: 'f6074d1039a9151d0f97dc6ec9ee0cd9c7b865f1af646d718ab38b659fa84f3f',
  },
  {
    path: 'KokoroAlignment.mlmodelc/coremldata.bin',
    bytes: 484,
    sha256: '9a0fb4a536f665a052914d7f17b0e6ac80a3614f702e4be87ac0302c1143a4ea',
  },
  {
    path: 'KokoroAlignment.mlmodelc/metadata.json',
    bytes: 3_021,
    sha256: '6f610d23b9f93c7f1a968d6a861efa99725a191de696bf1c3be334ead39b7f00',
  },
  {
    path: 'KokoroAlignment.mlmodelc/model.mil',
    bytes: 8_194,
    sha256: 'eb3a618bda0cdf95cdffab586ef5c76333d0d0a1dcb881190b3ef414f3421b3e',
  },
  {
    path: 'KokoroAlignment.mlmodelc/weights/weight.bin',
    bytes: 4_128,
    sha256: '2e7d69128b59d615fc3d3cf85637a687235fc086b1eb136359adb11a61615f6b',
  },
  {
    path: 'KokoroNoise_v2.mlmodelc/analytics/coremldata.bin',
    bytes: 243,
    sha256: '53af6bf61482f6002bdb6e3a62f30774cde6e96411aebd888222a34b369f3d04',
  },
  {
    path: 'KokoroNoise_v2.mlmodelc/coremldata.bin',
    bytes: 440,
    sha256: '9911047f924b41f8b92811c32c50b7c718bd7b0c14842b3bc1b66b9ffe341a19',
  },
  {
    path: 'KokoroNoise_v2.mlmodelc/metadata.json',
    bytes: 3_020,
    sha256: 'eb3102217532d952479c6f1b04d26d7ac4cdbc59875b6a23e8aae86e5e02c2bc',
  },
  {
    path: 'KokoroNoise_v2.mlmodelc/model.mil',
    bytes: 93_152,
    sha256: '60233949d896f15ef38aea19afda558935d7569fa77a3ca4babddd3ffe845a36',
  },
  {
    path: 'KokoroNoise_v2.mlmodelc/weights/weight.bin',
    bytes: 4_580_160,
    sha256: '1102fc2d31dfcfe3de3978a4c78b65202ff8b0a4d55a9304213bd4e8bda66bc2',
  },
  {
    path: 'KokoroPostAlbert.mlmodelc/analytics/coremldata.bin',
    bytes: 243,
    sha256: '6640044c875505382edbc361cdd56f3f1c30f082953e0f9473a31ae3f71e6c43',
  },
  {
    path: 'KokoroPostAlbert.mlmodelc/coremldata.bin',
    bytes: 556,
    sha256: '86de3ab0c1e8c6f8842b57bc24695a5099590c49b864e3fa2737b1fb5b15ba3b',
  },
  {
    path: 'KokoroPostAlbert.mlmodelc/metadata.json',
    bytes: 4_171,
    sha256: '2e3be1af412a76e340120a01cd04a502666371ada86b1fdaf5a622896e0bf979',
  },
  {
    path: 'KokoroPostAlbert.mlmodelc/model.mil',
    bytes: 60_047,
    sha256: '450b73a3b179e1702e7b2210bad008eac20d58b2d6076e3c2de76290a66e5fef',
  },
  {
    path: 'KokoroPostAlbert.mlmodelc/weights/weight.bin',
    bytes: 13_806_464,
    sha256: 'e4f300a23cc2e05d38680d9fc94681cc722d445076d1d248f83255122ba091c8',
  },
  {
    path: 'KokoroProsody_v2.mlmodelc/analytics/coremldata.bin',
    bytes: 243,
    sha256: '804d7d2e9a8fed345cedb57da61bd27fdd95db22a070cfa7d42ccd4f8e80a443',
  },
  {
    path: 'KokoroProsody_v2.mlmodelc/coremldata.bin',
    bytes: 421,
    sha256: 'db8776a4896f690fd254cdb68a4551c168411c9b3fb98219630215bc3c357986',
  },
  {
    path: 'KokoroProsody_v2.mlmodelc/model.mil',
    bytes: 73_353,
    sha256: 'e6acad9f44d70b1dba0aea6a5d25ee4edf68fe8f2933399ee81f70ace61cbc8b',
  },
  {
    path: 'KokoroProsody_v2.mlmodelc/weights/weight.bin',
    bytes: 8_513_664,
    sha256: '70eea4cd2523992fa1fea840e31ab6f4fdd69c1598e220985a2ae6ea5da1e944',
  },
  {
    path: 'KokoroTail_v2.mlmodelc/analytics/coremldata.bin',
    bytes: 243,
    sha256: 'a06e4b91c2b8a8be3ff701558a5f1f6484921f948202663fe6df78f248d42222',
  },
  {
    path: 'KokoroTail_v2.mlmodelc/coremldata.bin',
    bytes: 392,
    sha256: '527271f6df56cc308a5f89374c92108aef7b837ab15f0ba4900d555588dbd905',
  },
  {
    path: 'KokoroTail_v2.mlmodelc/metadata.json',
    bytes: 1_872,
    sha256: '7708ecc145eecf8e3ef5ef8979ea7a4f77d04c8da787454c6d9190e5300fc50b',
  },
  {
    path: 'KokoroTail_v2.mlmodelc/model.mil',
    bytes: 7_014,
    sha256: 'b0b8fd573bac76ba7eb85730eeb25538fc7f1c666ecbf939fd4b3a4ad4495ad7',
  },
  {
    path: 'KokoroTail_v2.mlmodelc/weights/weight.bin',
    bytes: 81_088,
    sha256: '8ede31ec20df7d86a124287ac12d13507651e2a693e9d4f35f0e7f92cba422c7',
  },
  {
    path: 'KokoroVocoder.mlmodelc/analytics/coremldata.bin',
    bytes: 243,
    sha256: '1cc4f1e6436597c6d458a845570d9d0ace458813ff90f225d08e0e713496b463',
  },
  {
    path: 'KokoroVocoder.mlmodelc/coremldata.bin',
    bytes: 626,
    sha256: '71bac80d2f2f077fefc0d66cdc39c0faaa96540b3a6149093ef29de01b1f8764',
  },
  {
    path: 'KokoroVocoder.mlmodelc/metadata.json',
    bytes: 4_331,
    sha256: 'a8e768f151225a52476d35f6ab90805ae00f1f78b83be4ca21327029c800c183',
  },
  {
    path: 'KokoroVocoder.mlmodelc/model.mil',
    bytes: 309_000,
    sha256: '52f2febec45094e78a5948a3a47f023be8fc57cfd48cc99e8d4c358a13674ef2',
  },
  {
    path: 'KokoroVocoder.mlmodelc/weights/weight.bin',
    bytes: 48_889_920,
    sha256: '6d1f96eb50218ab687b12d6d862d2ae854c12b7165c3cd9b6b5cef261ef02ff1',
  },
  {
    path: 'LICENSE',
    bytes: 11_339,
    sha256: 'f29080b0389b53eb15c81fd882c3c71dcbf92b99c5d94ea51df9d7d877fd9fe4',
  },
  {
    path: 'README.md',
    bytes: 4_813,
    sha256: 'a7e69f9c803f7df5b6121c489b1f83b3b261fabd7ed0421d81cb26cb8e387c6f',
  },
  {
    path: 'af_heart.bin',
    bytes: 522_240,
    sha256: 'd583ccff3cdca2f7fae535cb998ac07e9fcb90f09737b9a41fa2734ec44a8f0b',
  },
  BM_GEORGE,
  {
    path: 'vocab.json',
    bytes: 1_416,
    sha256: '8d65b0188b77eafc60751dac42bbac7ab5f5685074af44db91d1877b42dc1d7c',
  },
];

/** The sum of the files' sizes: what a full download fetches. */
export const TOTAL_BYTES = 83_332_513;

/** An http(s) origin with an optional port, then a path of plain segments ending in `/`, and nothing else. */
const LOCAL_BASE = /^https?:\/\/[A-Za-z0-9.-]+(?::[0-9]{1,5})?\/(?:[A-Za-z0-9._~-]+\/)*$/;

/**
 * Where a download reads from. A release build always reads the mirror; a
 * development build reads the base it was asked for (a local model server)
 * when that base is a plain http(s) folder, and the mirror otherwise.
 */
export const baseFor = (dev: boolean, asked: Option.Option<string>): string => {
  if (!dev) return MIRROR;
  return Option.match(asked, {
    onNone: () => MIRROR,
    onSome: (base) => {
      if (LOCAL_BASE.test(base)) return base;
      return MIRROR;
    },
  });
};
