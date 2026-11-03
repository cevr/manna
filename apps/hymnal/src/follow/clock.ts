export const SLACK = 250;

export interface Clock {
  readonly at: number;
  readonly stamp: number;
  readonly playing: boolean;
  readonly rate: number;
}

export const clockAt = (at: number, playing: boolean, now: number, rate = 1): Clock => ({
  at,
  stamp: now,
  playing,
  rate,
});

export const placeOf = (clock: Clock, now: number): number =>
  clock.at + Number(clock.playing) * clock.rate * Math.max(0, now - clock.stamp);

export interface Report {
  readonly at: number;
  readonly playing: boolean;
  readonly seek: boolean;
  readonly rate?: number;
}

export const observe = (clock: Clock, report: Report, now: number): Clock => {
  const running = placeOf(clock, now);
  const rate = report.rate ?? 1;
  if (report.seek || Math.abs(report.at - running) > SLACK)
    return clockAt(report.at, report.playing, now, rate);
  return clockAt(Math.max(report.at, running), report.playing, now, rate);
};
