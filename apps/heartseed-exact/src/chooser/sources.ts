/**
 * The chapter screen's data sources, as `app.ts` registers them. Each
 * answers at once from the canon and the corpus the data module imports,
 * and touches no storage: `chapterTap` the range after a tap and
 * `chapterRead` the chapter's field marks and its bar (`./bar.ts`, over the
 * chooser's rules in `./chooser.ts`), given the single verses' and the
 * field's references, each joined by `|`; `chapterLand` the room a verse
 * opened on lands under, from the frames the chapter reads. A place's book and chapter
 * arrive as its text.
 */

import { chapterSources } from './bar';
import { landSources } from './land';

/** The chapter screen's sources, and where a verse opened on lands (`./land.ts`). */
export const chooserSources = { ...chapterSources, ...landSources };
