import type { AllowList } from '@manna/exact-kit/look';

/** The measures `pm-hy-player` still writes as literals, by file, with how often: each a token of `app.forma` to be, taken off as it is (`measures.test.ts`). */
export const allowed = {
  'features/player.contract': {
    'gap=12': 1,
    'padding="8px 16px"': 2,
    'min-height=44': 3,
    'gap=2': 1,
    'min-height="5rem"': 1,
    'border-radius=10': 1,
    'padding="10px 18px"': 1,
    'min-width=44': 1,
    'font-weight=600': 1,
    'padding=20': 1,
    'gap=16': 1,
    'gap=8': 5,
  },
} satisfies AllowList;
