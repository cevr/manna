import type { AllowList } from '@manna/exact-kit/look';

/** The measures `pm-hy-home` still writes as literals, by file, with how often: each a token of `app.forma` to be, taken off as it is (`measures.test.ts`). */
export const allowed = {
  'features/list.contract': {
    'gap=8': 1,
    'padding="8px 16px"': 1,
    'min-height="5rem"': 1,
  },
  'features/recent.contract': {
    'padding="8px 16px"': 1,
  },
} satisfies AllowList;
