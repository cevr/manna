/**
 * Fetch a pinned source's files into the cache, each checked against its
 * SHA-256: a cached file that matches is kept, one that does not is fetched
 * again, and a fetched file that does not match fails the build (it is left
 * aside as `.part`, never used).
 */

import { mkdirSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type { Pinned, Source } from './pins';

const sha256Of = async (path: string): Promise<string> => {
  const hasher = new Bun.CryptoHasher('sha256');
  for await (const chunk of Bun.file(path).stream()) hasher.update(chunk);
  return hasher.digest('hex');
};

const matches = async (path: string, file: Pinned): Promise<boolean> =>
  (await Bun.file(path).exists()) &&
  Bun.file(path).size === file.size &&
  (await sha256Of(path)) === file.sha256;

/** The folder a source's files lie in under `cache`: `<cache>/<repo>`, as transformers.js reads a local model. */
export const folderOf = (cache: string, source: Source): string => join(cache, source.repo);

/** Every file of `source` in `<cache>/<repo>/<path>`, checked; the folder. */
export const fetchSource = async (cache: string, source: Source): Promise<string> => {
  const folder = folderOf(cache, source);
  for (const file of source.files) {
    const path = join(folder, file.path);
    if (await matches(path, file)) continue;
    mkdirSync(dirname(path), { recursive: true });
    const url = `https://huggingface.co/${source.repo}/resolve/${source.revision}/${file.path}`;
    console.error(`[meaning] fetch ${source.repo} ${file.path} bytes=${file.size}`);
    const response = await fetch(url);
    if (!response.ok || response.body === null)
      throw new Error(`meaning: ${url} answered ${response.status}`);
    const part = `${path}.part`;
    const writer = Bun.file(part).writer();
    const hasher = new Bun.CryptoHasher('sha256');
    for await (const chunk of response.body) {
      hasher.update(chunk);
      writer.write(chunk);
    }
    await writer.end();
    const sha256 = hasher.digest('hex');
    if (sha256 !== file.sha256 || Bun.file(part).size !== file.size)
      throw new Error(`meaning: ${file.path} has sha256 ${sha256}, not the pinned ${file.sha256}`);
    renameSync(part, path);
  }
  return folder;
};
