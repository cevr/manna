import type { CreditLine } from '@manna/hymnal/recordings';

/** A credit's words before its licence: the part, the work and its author, run on to the licence. */
export const creditHead = (line: CreditLine): string =>
  `${line.part}: ${line.work} by ${line.author}, `;

/** What ends a credit, after its licence. */
export const CREDIT_END: string = '.';
