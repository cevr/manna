/* oxlint-disable effect/noNullish, effect/noGlobals -- the host tool's clock: a cell's start and capture are the host's local dates, the agent's launch date is one too, and a face that held is no reason (none). */

/**
 * Heartseed's greeting at a local hour, the face a cell is drawn in (spec,
 * "The clock"): morning from 04:00, afternoon from 12:00, evening from 18:00
 * (`greetingOf` in `@manna/heartseed/home`, whose module this harness cannot
 * import without the app's bundled corpus; the test holds these hours to
 * its constants).
 */
export const faceAt = (hour: number) => {
  if (hour >= 4 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 18) return 'Good afternoon';
  return 'Good evening';
};

/** Why a cell started at `started` and taken at `taken` is refused: its greeting's face changed between them; none when it held. */
export const faceChanged = (started: Date, taken: Date) => {
  const [before, after] = [faceAt(started.getHours()), faceAt(taken.getHours())];
  if (before === after) return undefined;
  return `face changed: started at ${started.toTimeString().slice(0, 8)} (${before}), taken at ${taken.toTimeString().slice(0, 8)} (${after}); take it again`;
};

/** The zone the host's clock reads in, as an IANA name. */
export const hostZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** What a reference's metadata says of its clock: its local hour, and its zone when it was recorded. */
interface Taken {
  readonly hour: number;
  readonly timeZone?: string;
}

/**
 * The agent's launch clock for the port's side of a cell: `today`'s local
 * date at half past the reference's hour (so a `clock settle` cannot carry
 * it into the next hour), in the host's zone, as `--epoch` and `--time-zone`
 * take them. A reference recorded in another zone is refused: its hour is
 * not this host's.
 */
export const portClock = (reference: Taken, today: Date, zone: string) => {
  if (reference.timeZone !== undefined && reference.timeZone !== zone)
    return {
      _tag: 'Refused' as const,
      reason: `taken in ${reference.timeZone}, the host is in ${zone}`,
    };
  const at = new Date(today);
  at.setHours(reference.hour, 30, 0, 0);
  return { _tag: 'Clock' as const, epoch: at.getTime(), timeZone: zone };
};
