/**
 * A pack the reader downloads, as the one downloader takes it (q126): its
 * name, its address on egw.cvr.im, its file in `app:/data`, how the reader
 * names it, and its check. Every pack is versioned by its content
 * (`<count>-<sum as 8 hex digits>`, its `version` field among those before
 * its body), answers `304` for `If-None-Match` its version, and is checked
 * whole before it is kept.
 */

import type { PackWords } from './shown';
import type { Check, Versioned } from './step';

/** One downloadable pack. */
export interface PackSpec<P extends Versioned> extends PackWords {
  /** Its address on the base: `/api/commentary/pack`. */
  readonly path: string;
  /** Its one file: `app:/data/commentary.json`, which `app.ts` grants `fs.read` and `fs.write`. */
  readonly file: string;
  /** Whether a body is a pack to keep, and the pack it holds. */
  readonly check: Check<P>;
}

/** How far into a kept file its version is looked for: the fields before its body. */
const HEAD = 256;

/**
 * The version a kept file names, read from its head alone, so finding what
 * is kept parses nothing; empty when its head names none. A kept file was
 * checked whole before its one atomic write.
 */
export const versionAt = (text: string): string =>
  /"version":"(\d+-[0-9a-f]{8})"/u.exec(text.slice(0, HEAD))?.[1] ?? '';
