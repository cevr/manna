import type { AllowList } from '@manna/exact-kit/look';

/** The measures `pm-hs-add` still writes as literals, by file, with how often: each a token of `app.forma` to be, taken off as it is (`measures.test.ts`). */
export const allowed = {
  'features/add.contract': {
    'gap=2': 4,
    'gap=12': 2,
    'padding="12px 20px"': 2,
    'padding=20': 1,
    'max-width="40rem"': 1,
    'gap=6': 1,
  },
} satisfies AllowList;
