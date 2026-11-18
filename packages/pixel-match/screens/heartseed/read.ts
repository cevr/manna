/**
 * Heartseed's Exact-only screens (`pm-hs-read`, `pm-hs-study`): no One
 * reference; each is restyled in One's visual language and judged by the
 * token audit and the owner's look (spec section 4).
 */
import type { Row } from '../../src/model.ts';

export const rows: ReadonlyArray<Row> = [
  ...[
    'x.tabs',
    'x.read.chapter',
    'x.read.selected',
    'x.read.pending',
    'x.goto.sheet',
    'x.goto.book',
  ].map((id): Row => ({ id, unit: 'pm-hs-read', kind: 'exact-only' })),
  { id: 'x.find.results', unit: 'pm-hs-read', kind: 'exact-only' },
  ...['x.type.sheet', 'x.study.sheet', 'x.study.word', 'x.study.states'].map((id): Row => ({
    id,
    unit: 'pm-hs-study',
    kind: 'exact-only',
  })),
  { id: 'x.verses', unit: 'pm-hs-read', kind: 'exact-only' },
];
