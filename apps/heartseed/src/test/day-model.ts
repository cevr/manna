/* oxlint-disable effect/noNullish, effect/noTernary -- the generator writes the hslocal spec's edges out as plain branches over undefined, apart from `src/day.ts`, so the two cannot share a mistake. */

/**
 * The moments days sown is hardest at, found from `Intl` alone (`zone.ts`),
 * never from `src/day.ts`: each zone's daylight-saving changes, to the
 * millisecond; the local 04:00 at which a reader's day starts, by the
 * offset a record stores; two recitals at one wall time on a fall-back
 * night; old records at the UTC midnight; offsets at the bounds. Each
 * moment is a start and the offset a device in its zone stores for it, or
 * none for a record kept before offsets were stored.
 */

import type { Recall } from '../sayit';
import { below, DAY, MINUTE, pickOf } from './garden-model';
import { offsetIn, ZONES } from './zone';

const HOUR = 3_600_000;

/** A start and the offset its record stores (none for an old record), and the edge it sits at. */
export interface Moment {
  readonly at: number;
  readonly offset: number | undefined;
  readonly kind: string;
}

/** A zone's change of offset: the first millisecond of the new offset, and the offsets before and after. */
interface Change {
  readonly zone: string;
  readonly at: number;
  readonly before: number;
  readonly after: number;
}

/** The zones whose clocks change: north (New York, Berlin), south (Sydney, Lord Howe's half hour), and Sao Paulo's last years of daylight saving. */
const CHANGING: readonly (readonly [string, number])[] = [
  ['America/New_York', 2026],
  ['Europe/Berlin', 2026],
  ['Australia/Sydney', 2026],
  ['Australia/Lord_Howe', 2026],
  ['America/Sao_Paulo', 2018],
  ['America/Sao_Paulo', 2019],
];

/** Every change of `zone`'s offset in `year`: scanned a day at a time, then halved down to the millisecond. */
const changesIn = (zone: string, year: number): Change[] => {
  const changes: Change[] = [];
  const end = Date.UTC(year + 1, 0, 1);
  let after = offsetIn(zone, Date.UTC(year, 0, 1));
  for (let day = Date.UTC(year, 0, 1); day < end; day += DAY) {
    const before = after;
    after = offsetIn(zone, day + DAY);
    if (before === after) continue;
    let low = day;
    let high = day + DAY;
    while (high - low > 1) {
      const mid = Math.floor((low + high) / 2);
      if (offsetIn(zone, mid) === before) low = mid;
      else high = mid;
    }
    changes.push({ zone, at: high, before, after });
  }
  return changes;
};

/** The daylight-saving changes of every changing zone, found once. */
export const CHANGES = CHANGING.flatMap(([zone, year]) => changesIn(zone, year)) as [
  Change,
  ...Change[],
];

/** A device in `zone` at `at`: the moment and the offset it stores. */
const inZoneAt = (zone: string, at: number, kind: string): Moment => ({
  at,
  offset: offsetIn(zone, at),
  kind,
});

/** The instant a record stamped in `zone` reads 04:00 on the UTC calendar date of `date`, by the offset it stores there. */
export const fourIn = (zone: string, date: number) => {
  const wall = Math.floor(date / DAY) * DAY + 4 * HOUR;
  const guess = wall - offsetIn(zone, wall) * MINUTE;
  return wall - offsetIn(zone, guess) * MINUTE;
};

/** A date in 2025-2027. */
const anyDate = (next: () => number) => Date.UTC(2025, 0, 1) + below(next, 3 * 365) * DAY;

/**
 * Moments at one edge: 03:59:59.999, 04:00:00.000, 04:00:00.001 or half an
 * hour either side of a local 04:00; a millisecond or hours either side of
 * a daylight-saving change; two starts at one wall time on a fall-back
 * night; an old record a millisecond either side of the UTC midnight; a
 * stored offset at a bound or zero.
 */
export const edgeMoments = (next: () => number): Moment[] => {
  const roll = below(next, 5);
  if (roll === 0) {
    const zone = pickOf(next, ZONES);
    const four = fourIn(zone, anyDate(next));
    const by = pickOf(next, [-1, 0, 1, -30 * MINUTE, 30 * MINUTE] as const);
    return [inZoneAt(zone, four + by, '04:00 edge')];
  }
  if (roll === 1) {
    const change = pickOf(next, CHANGES);
    const by = pickOf(next, [-1, 0, 1, -2 * HOUR, 2 * HOUR, -HOUR, HOUR] as const);
    return [inZoneAt(change.zone, change.at + by, 'dst edge')];
  }
  if (roll === 2) {
    const backs = CHANGES.filter((change) => change.after < change.before);
    const change = pickOf(next, backs as [Change, ...Change[]]);
    const shift = (change.before - change.after) * MINUTE;
    const first = change.at - pickOf(next, [1, 10 * MINUTE, Math.floor(shift / 2)] as const);
    return [
      inZoneAt(change.zone, first, 'fall-back twice'),
      inZoneAt(change.zone, first + shift, 'fall-back twice'),
    ];
  }
  if (roll === 3) {
    const midnight = Math.floor(anyDate(next) / DAY) * DAY;
    return [
      {
        at: midnight + pickOf(next, [-1, 0] as const),
        offset: undefined,
        kind: 'old at utc midnight',
      },
    ];
  }
  return [
    {
      at: anyDate(next) + below(next, DAY),
      offset: pickOf(next, [1080, -1080, 0] as const),
      kind: 'bound offset',
    },
  ];
};

/** `recall` as stored at `moment`: its start and its offset, none for an old record. */
export const storedAt = (recall: Recall, moment: Pick<Moment, 'at' | 'offset'>): Recall => {
  const { offset: _, ...rest } = recall;
  return moment.offset === undefined
    ? { ...rest, startedAt: moment.at }
    : { ...rest, startedAt: moment.at, offset: moment.offset };
};

/** `recall` stamped as a device would have stored it: kept before offsets were (about one in four), at a bound now and then, else in a zone of the pool. */
export const stamped = (next: () => number, recall: Recall): Recall => {
  const roll = next();
  if (roll < 0.25) return storedAt(recall, { at: recall.startedAt, offset: undefined });
  if (roll < 0.28)
    return storedAt(recall, {
      at: recall.startedAt,
      offset: pickOf(next, [1080, -1080, 0] as const),
    });
  return storedAt(recall, {
    at: recall.startedAt,
    offset: offsetIn(pickOf(next, ZONES), recall.startedAt),
  });
};
