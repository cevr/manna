import type { AllowList } from '@manna/exact-kit/look';

/** The measures `pm-hy-find` still writes as literals, by file, with how often: each a token of `app.forma` to be, taken off as it is (`measures.test.ts`). */
export const allowed = {
  'features/find.contract': {
    'gap=8': 1,
    'padding="4px 16px"': 2,
    'min-height=44': 8,
    'gap=6': 2,
    'min-width=44': 3,
    'padding=16': 4,
    'border-radius=16': 1,
    'border=(findDrumsWeb ? "1px solid line" : "none")': 1,
    'box-shadow=(findDrumsWeb ? "0 16px 48px color-mix(in srgb, shadow 24%, transparent)" : "none")': 1,
    'gap=12': 4,
    'width="17.5rem"': 1,
    'border-radius=10': 1,
    'padding="10px 18px"': 1,
    'font-weight=600': 1,
    'min-width="1.5rem"': 1,
    'min-width="2.75rem"': 1,
    'min-width="2.5rem"': 1,
  },
} satisfies AllowList;
