/* oxlint-disable effect/noGlobals, effect/noNullish, effect/noTryCatch -- the tests' zones are the host's, switched through `process.env.TZ`, which Bun reads at run time, and restored even when the work in them throws; a zone's offset is read from `Date`'s and `Intl`'s own fields. */

/**
 * Time zones for the tests, written apart from `src/day.ts` so the app's
 * offset is never its own oracle: the host's offset by its wall clock's
 * fields, a named zone's offset by `Intl`, and work run in a zone.
 */

const MINUTE = 60_000;

/** The minutes east of UTC that `wall`, the wall clock's fields read as a UTC time, lies from the instant `at`. */
const minutesFrom = (wall: number, at: number) => Math.round((wall - at) / MINUTE) + 0;

/** The host zone's offset at `at`, in minutes east of UTC, from its wall clock's fields (never `getTimezoneOffset`). */
export const hostOffset = (at: number) => {
  const d = new Date(at);
  const wall = new Date(0);
  wall.setUTCFullYear(d.getFullYear(), d.getMonth(), d.getDate());
  wall.setUTCHours(d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds());
  return minutesFrom(wall.getTime(), at);
};

const formats = new Map<string, Intl.DateTimeFormat>();

/** The named zone's offset at `at`, in minutes east of UTC, from `Intl`'s wall clock in that zone; the host's zone plays no part. */
export const offsetIn = (zone: string, at: number) => {
  const format =
    formats.get(zone) ??
    new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
  formats.set(zone, format);
  const part = (type: string) =>
    Number(format.formatToParts(at).find((each) => each.type === type)?.value ?? 0);
  const wall = new Date(0);
  wall.setUTCFullYear(part('year'), part('month') - 1, part('day'));
  wall.setUTCHours(part('hour'), part('minute'), part('second'), ((at % 1000) + 1000) % 1000);
  return minutesFrom(wall.getTime(), at);
};

/** Sets the host's zone to `zone`, which the runtime's `Date` reads at once. */
export const travel = (zone: string) => {
  process.env.TZ = zone;
};

/** The host's zone now, to be put back with `restore`. */
export const hostZone = () => process.env.TZ;

/** Puts back the zone `hostZone` gave. */
export const restore = (zone: string | undefined) => {
  if (zone === undefined) delete process.env.TZ;
  else process.env.TZ = zone;
};

/** `work` run with the host's zone set to `zone`, the zone before it restored before it returns or throws. */
export const inZone = <A>(zone: string, work: () => A): A => {
  const before = hostZone();
  travel(zone);
  try {
    return work();
  } finally {
    restore(before);
  }
};

/** Zones every side of UTC: whole hours west and east, a half hour (Kolkata, St John's), three quarters (Kathmandu, Chatham), ±12-14 h, UTC itself, and daylight saving north (New York, Berlin), south (Sydney, Sao Paulo's history) and by half an hour (Lord Howe). */
export const ZONES = [
  'America/New_York',
  'America/Los_Angeles',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Kolkata',
  'America/St_Johns',
  'Asia/Kathmandu',
  'Pacific/Chatham',
  'Etc/GMT+12',
  'Pacific/Pago_Pago',
  'Pacific/Kiritimati',
  'UTC',
  'Australia/Sydney',
  'America/Sao_Paulo',
  'Australia/Lord_Howe',
] as const;
