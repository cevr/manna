import type { AllowList } from '@manna/exact-kit/look';

/** The measures `pm-hs-today` still writes as literals, by file, with how often: each a token of `app.forma` to be, taken off as it is (`measures.test.ts`). */
export const allowed = {
  'features/today.contract': {
    'gap=20': 2,
    'gap=8': 2,
    'min-width=44': 2,
    'min-height=44': 2,
    'column-gap=8': 1,
    'row-gap=4': 1,
    'line-height=1.5': 2,
    'gap=12': 2,
    'border-radius=999': 1,
    'padding=20': 1,
    'max-width="40rem"': 1,
  },
  'features/session.contract': {
    'gap=12': 2,
  },
} satisfies AllowList;
