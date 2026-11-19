/**
 * Heartseed's Settings sheet (`pm-hs-settings`): in One from the `Settings`
 * row at home's foot, in the port from the gear. A page sheet, scored
 * whole. The port's Sounds and haptics row is Exact-only and stands where
 * One draws `Show the welcome again` (a gap), so one mask covers the place
 * of both; the natural voice's status line under `Voice: Her` is a gap
 * (`settings.natural`) and masked where One draws it.
 */
import type { MaskSpec, Row, Step } from '../../src/model.ts';
import { FOOT, HOME } from './home.ts';

const unit = 'pm-hs-settings';

export const SHEET: ReadonlyArray<Step> = [HOME, FOOT, { tap: 'label=Settings' }, { wait: 800 }];

/** The port's way to the sheet: the gear. */
const EXACT_SHEET: ReadonlyArray<string> = ['clock data', 'tap gear', 'clock settle'];

/** The left edge and width of the foot's first row: One's `Show the welcome again` (24 to 237 pt), the port's Sounds and haptics row inside it. */
const FOOT_ROW = { x: 23, width: 218 } as const;

/** The foot's first row at `top`, its 44 pt and a point each side for the edges' anti-aliasing. */
const footRow = (top: number): MaskSpec => ({
  ...FOOT_ROW,
  y: top - 1,
  height: 46,
  reason:
    "One's Show the welcome again (a gap: the port has no welcome) and the port's Sounds and haptics row (Exact-only), in one place",
});

export const rows: ReadonlyArray<Row> = [
  {
    id: 'settings.sheet',
    unit,
    kind: 'match',
    sweep: true,
    fixture: 'hs-fresh',
    one: {
      steps: SHEET,
      masks: [
        {
          x: 23,
          y: 324,
          width: 280,
          height: 23,
          reason:
            "the natural voice's status line under Voice: Her, a gap (settings.natural, ex-hs-natural)",
        },
        footRow(474),
      ],
    },
    exact: { ops: EXACT_SHEET },
  },
  {
    id: 'settings.chosen',
    unit,
    kind: 'match',
    fixture: 'hs-fresh',
    one: {
      steps: [
        ...SHEET,
        { tap: 'label=20 min' },
        { tap: 'label=Voice' },
        { tap: 'label=Voice' },
        { tap: 'label=Dark' },
        { wait: 600 },
      ],
      masks: [footRow(443)],
    },
    exact: {
      ops: [
        ...EXACT_SHEET,
        'tap minutes-20',
        'tap voice-off',
        'tap appearance-dark',
        'clock data',
        'clock settle',
      ],
    },
  },
  {
    id: 'settings.natural',
    unit: 'ex-hs-natural',
    kind: 'gap',
    fixture: 'hs-fresh',
    one: {
      steps: [],
      notDrawn: {
        ios: "the natural voice's status lines need its model server and a download, which a reference capture does not start",
      },
    },
  },
  { id: 'x.settings.feel', unit, kind: 'exact-only' },
];
