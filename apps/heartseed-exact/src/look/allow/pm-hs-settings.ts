import type { AllowList } from '@manna/exact-kit/look';

/** The measures `pm-hs-settings` still writes as literals, by file, with how often: each a token of `app.forma` to be, taken off as it is (`measures.test.ts`). */
export const allowed = {
  'features/settings.contract': {
    'gap=8': 2,
    'gap=24': 1,
    'padding=20': 1,
    'gap=12': 1,
    'min-height="44px"': 1,
  },
} satisfies AllowList;
