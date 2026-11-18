import type { AllowList } from '@manna/exact-kit/look';

/** The measures `pm-hy-hymn` still writes as literals, by file, with how often: each a token of `app.forma` to be, taken off as it is (`measures.test.ts`). */
export const allowed = {
  'features/hymn.contract': {
    'padding="8px 16px"': 1,
    'padding=16': 1,
    'gap=20': 1,
    'gap=4': 2,
  },
  'features/chords.contract': {
    'gap=12': 3,
    'gap=2': 2,
    'gap=6': 1,
    'column-gap="0.35em"': 1,
    'row-gap=4': 1,
    'padding-right="0.3em"': 2,
    'padding="8px 16px"': 1,
    'gap=24': 1,
    'padding=24': 1,
    'gap=8': 1,
    'font-size="min(-exact-footnote, 13px)"': 1,
    'font-size="min(-exact-caption2, 11px)"': 2,
    'font-weight=700': 2,
    'width=(b.left - 8)': 1,
    'font-size="min(-exact-caption1, 12px)"': 1,
  },
  'features/notfound.contract': {
    'padding="8px 16px"': 1,
    'min-width=44': 1,
    'min-height=44': 1,
    'padding="0 12px"': 1,
  },
} satisfies AllowList;
