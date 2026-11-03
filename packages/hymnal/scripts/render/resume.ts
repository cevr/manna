export const hashOf = (parts: ReadonlyArray<readonly [string, string]>) => {
  const hasher = new Bun.CryptoHasher('sha256');
  for (const [name, text] of parts) {
    hasher.update(`${name}\0`);
    hasher.update(text);
    hasher.update('\0');
  }
  return hasher.digest('hex');
};

export const keyOf = (config: string, midiSha256: string) =>
  hashOf([
    ['config', config],
    ['midi', midiSha256],
  ]);

export const SAME_SOUND: ReadonlyArray<{ readonly config: string; readonly sounds: string }> = [
  {
    config: '681f4a71a8bc3f8ab2604f9f07f55435f092b05bd5abf6ba0b489d81794a7c4f',
    sounds: 'd64f5b1fbd0f75c088169515be5754b0fe0112b2b723da82ead194ba20a3b9e4',
  },
];

export const keysOf = (
  config: string,
  midiSha256: string,
  same: ReadonlyArray<{ readonly config: string; readonly sounds: string }> = SAME_SOUND,
) => [
  keyOf(config, midiSha256),
  ...same.filter((s) => s.sounds === config).map((s) => keyOf(s.config, midiSha256)),
];

export type Resume = 'render' | 'check';

export const resumeOf = (
  record: { readonly key: string; readonly sha256: string } | undefined,
  keys: ReadonlyArray<string>,
  mp3Sha256: string | undefined,
): Resume =>
  record !== undefined && keys.includes(record.key) && record.sha256 === mp3Sha256
    ? 'check'
    : 'render';
