/**
 * `@manna/hymnal-app/tuner/screen` as Exact's type check reads it (the
 * app's `tsconfig.json` maps it here): the tuner screen's own rules, each
 * `Option` named by its shapes. `src/tuner/held.test.ts` holds it to the
 * source.
 */

import type { Opt } from '@manna/hymnal-app/hymns/chords';
import type { Reading, StringId } from '@manna/hymnal-app/tuner/tuning';

export declare const noteOf: (heard: Opt<Pick<Reading, 'note' | 'octave' | 'inTune'>>) => string;
export declare const LABEL_EVERY: number;
export declare const LOWEST: StringId;
export declare const pickOf: (aim: Opt<StringId>, id: StringId) => Opt<StringId>;
export declare const autoOf: (aim: Opt<StringId>, last: Opt<StringId>) => Opt<StringId>;
export declare const BACK_TO_AUTO: string;
export declare const pickedHint: (picked: boolean) => Opt<string>;
export declare const SWING: number;
export declare const TICKS: ReadonlyArray<number>;
export declare const ACROSS: ReadonlyArray<StringId>;
