import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

/** What one module's place in the app's `node_modules` needs: nothing, a link, a link put right, or a person. */
type Step =
  | { readonly _tag: 'kept' }
  | { readonly _tag: 'link'; readonly at: string; readonly target: string }
  | { readonly _tag: 'relink'; readonly at: string; readonly target: string }
  | { readonly _tag: 'problem'; readonly problem: string };

/** The step `@exact/<name>` in `appDir` needs to be a link to `<clone>/packages/<name>`. */
const stepFor = (appDir: string, name: string, clone: string): Step => {
  const target = join(clone, 'packages', name);
  const at = join(appDir, 'node_modules', '@exact', name);
  if (!existsSync(target))
    return { _tag: 'problem', problem: `no ${target}: clone Exact (docs/exact.md)` };
  const present = lstatSync(at, { throwIfNoEntry: false });
  if (present === undefined) return { _tag: 'link', at, target };
  if (!present.isSymbolicLink())
    return {
      _tag: 'problem',
      problem: `${at} is not a link to Exact's ${name}: move it out of the way, and the next run links it`,
    };
  if (readlinkSync(at) === target) return { _tag: 'kept' };
  return { _tag: 'relink', at, target };
};

/**
 * Links each of Exact's standard modules `names` (`speech-synthesis`, `media-capture`, …) into `appDir`'s
 * `node_modules/@exact/` from the clone at `clone`: Exact's modules live in the clone, not on npm, and no machine
 * path is committed. A link already right is kept and one elsewhere is put right. Every problem is named before
 * anything is written (a module the clone lacks, or a folder or file where a link goes), and then nothing is
 * written. The problems, or none when every name is linked.
 */
export const linkExactModules = (
  appDir: string,
  names: ReadonlyArray<string>,
  clone: string,
): ReadonlyArray<string> => {
  const steps = names.map((name) => stepFor(appDir, name, clone));
  const problems = steps
    .filter((step): step is Extract<Step, { _tag: 'problem' }> => step._tag === 'problem')
    .map((step) => step.problem);
  if (problems.length > 0) return problems;
  for (const step of steps) {
    if (step._tag === 'kept' || step._tag === 'problem') continue;
    mkdirSync(join(appDir, 'node_modules', '@exact'), { recursive: true });
    if (step._tag === 'relink') unlinkSync(step.at);
    symlinkSync(step.target, step.at, 'dir');
  }
  return [];
};

/**
 * Writes `source` to `path`, a generated module a build reads, only when the file holds something else or is
 * absent, so an unchanged module keeps its time and nothing downstream rebuilds. Whether it wrote.
 */
export const writeGenerated = (path: string, source: string): boolean => {
  if (existsSync(path) && readFileSync(path, 'utf8') === source) return false;
  writeFileSync(path, source);
  return true;
};
