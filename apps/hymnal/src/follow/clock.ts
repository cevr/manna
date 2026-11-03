/** How far a report may sit from the running clock and still be taken as the same place. */
export const SLACK = 250;

export interface Clock {
  /** The place, in ms, at `stamp`. */
  readonly at: number;
  /** When `at` was read, in ms of the host's clock. */
  readonly stamp: number;
  readonly playing: boolean;
  /** Ms of the hymn for each ms of the host's clock while it plays. */
  readonly rate: number;
}

/** A clock set at `at`, read at `now`, running at `rate` while it plays. */
export const clockAt = (at: number, playing: boolean, now: number, rate = 1): Clock => ({
  at,
  stamp: now,
  playing,
  rate,
});

/** The place at `now`: run on from the last report at the clock's rate while playing, held while not. */
export const placeOf = (clock: Clock, now: number): number =>
  clock.at + Number(clock.playing) * clock.rate * Math.max(0, now - clock.stamp);

/** A report from the player.  `seek` is true when the reader moved the place. */
export interface Report {
  readonly at: number;
  readonly playing: boolean;
  readonly seek: boolean;
  /** The rate the place moves at from here; 1 when not told. */
  readonly rate?: number;
}

/** The clock after a report read at `now`. */
export const observe = (clock: Clock, report: Report, now: number): Clock => {
  const running = placeOf(clock, now);
  const rate = report.rate ?? 1;
  if (report.seek || Math.abs(report.at - running) > SLACK)
    return clockAt(report.at, report.playing, now, rate);
  return clockAt(Math.max(report.at, running), report.playing, now, rate);
};
