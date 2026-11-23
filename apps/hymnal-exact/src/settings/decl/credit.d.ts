/**
 * `@manna/hymnal-app/credit` as Exact's type check reads it (the app's
 * `tsconfig.json` maps it here): the words About writes around a credit's
 * licence. The repo's typecheck reads the source itself.
 */
import type { CreditLine } from '@manna/hymnal/recordings';

/** The words a credit runs on to its licence with. */
export declare const creditHead: (line: CreditLine) => string;

/** What a credit ends with, after its licence. */
export declare const CREDIT_END: string;
