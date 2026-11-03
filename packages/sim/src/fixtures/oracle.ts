/* oxlint-disable effect/noNodeBuiltinImport, no-restricted-imports, effect/noTernary, effect/noTryCatch, effect/noAs -- the oracle answers where the OS takes a path through node:fs, independent of the contained host's FileSystem. */
/**
 * Where the OS takes a path, independent of the contained host (`host.ts`):
 * an existing path is what libc's `realpath` answers (`realpathSync.native`;
 * the JS `realpathSync` folds `..` before it follows a link); a dangling one, or one
 * whose last link is not followed, is an independent component walk that
 * takes a link's raw target into the remaining components before any `..`
 * after it, as the kernel does. A tree's closure is every link reachable
 * from it, through every directory a link inside it leads to.
 */
import * as nfs from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';

/** A path that loops through its links. */
export const LOOP = '<link-loop>';

const HOPS = 40;

const isLink = (file: string) => {
  try {
    return nfs.lstatSync(file).isSymbolicLink();
  } catch {
    return false;
  }
};

/** The component walk: each link expanded into the components still to walk, `..` taken on where the walk stands. */
const walk = (file: string, follow: boolean): string => {
  const pending = file.split('/').filter((part) => part !== '' && part !== '.');
  let at = '/';
  let hops = 0;
  while (pending.length > 0) {
    const part = pending.shift() ?? '';
    if (part === '.' || part === '') continue;
    if (part === '..') {
      at = dirname(at);
      continue;
    }
    const next = at === '/' ? `/${part}` : `${at}/${part}`;
    const last = pending.every((rest) => rest === '' || rest === '.');
    if ((follow || !last) && isLink(next)) {
      hops += 1;
      if (hops > HOPS) return LOOP;
      const target = nfs.readlinkSync(next);
      if (isAbsolute(target)) at = '/';
      pending.unshift(...target.split('/'));
      continue;
    }
    at = next;
  }
  return at;
};

/** Where the OS takes `file`: `realpathSync` when it exists, else the component walk. */
export const land = (file: string, follow: boolean): string => {
  if (!follow) return walk(file, false);
  try {
    return nfs.realpathSync.native(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ELOOP') return LOOP;
    return walk(file, true);
  }
};

const under = (file: string, dir: string) => file === dir || file.startsWith(`${dir}/`);

/**
 * The links reachable from the tree at `file` that land outside `inside`:
 * each directory reached, through a link or not, is read once by its
 * canonical path; an entry under one of `skips` (folders of the tree's
 * canonical form) is not read.
 */
export const treeEscapes = (
  file: string,
  inside: ReadonlyArray<string>,
  skips: ReadonlyArray<string> = [],
): Array<string> => {
  const top = land(file, true);
  const skipped = skips.map((skip) => join(top, skip));
  const seen = new Set<string>();
  const found: Array<string> = [];
  const visit = (dir: string) => {
    if (seen.has(dir)) return;
    seen.add(dir);
    let names: Array<string> = [];
    try {
      names = nfs.readdirSync(dir).toSorted();
    } catch {
      return;
    }
    for (const name of names) {
      const entry = join(dir, name);
      if (skipped.some((skip) => under(entry, skip))) continue;
      const info = nfs.lstatSync(entry);
      if (info.isSymbolicLink()) {
        const target = land(entry, true);
        if (target === LOOP || inside.some((root) => !under(target, root))) {
          found.push(`${entry} -> ${target}`);
          continue;
        }
        let directory = false;
        try {
          directory = nfs.statSync(target).isDirectory();
        } catch {
          directory = false;
        }
        if (directory) visit(target);
      } else if (info.isDirectory()) visit(entry);
    }
  };
  if (top !== LOOP) visit(top);
  return found;
};
