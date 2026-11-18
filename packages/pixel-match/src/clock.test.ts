/* oxlint-disable effect/noGlobals, effect/noAsyncFunction, effect/noThrowStatement, effect/noNewError -- the clock is the host's local date, so the test hands it fixed local dates; it reads Heartseed's own source for the greeting's hours, and a refused clock fails the test with its reason. */
import { describe, expect, test } from 'bun:test';

import { faceAt, faceChanged, hostZone, portClock } from './clock.ts';

/** Today's local date at `hour`:`minute`:`second`. */
const at = (hour: number, minute: number, second = 0) => {
  const date = new Date(2026, 10, 18);
  date.setHours(hour, minute, second, 0);
  return date;
};

describe('the clock a cell is drawn under', () => {
  test("the faces change at the hours Heartseed's greetingOf names", async () => {
    const source = await Bun.file(
      Bun.fileURLToPath(import.meta.resolve('@manna/heartseed/home')),
    ).text();
    const minutes = ['MORNING', 'AFTERNOON', 'EVENING'].map((name) =>
      Number(new RegExp(`const ${name} = (\\d+);`).exec(source)?.[1]),
    );
    expect(minutes).toEqual([4 * 60, 12 * 60, 18 * 60]);
    expect([3, 4, 11, 12, 17, 18, 23].map(faceAt)).toEqual([
      'Good evening',
      'Good morning',
      'Good morning',
      'Good afternoon',
      'Good afternoon',
      'Good evening',
      'Good evening',
    ]);
  });

  test('a cell that crosses noon between its start and its capture is refused; one inside a face is kept', () => {
    expect(faceChanged(at(11, 59, 56), at(12, 0, 5))).toContain('face changed');
    expect(faceChanged(at(17, 59, 59), at(18, 0, 1))).toContain('Good evening');
    expect(faceChanged(at(3, 59, 59), at(4, 0, 0))).toContain('Good morning');
    expect(faceChanged(at(12, 0, 5), at(12, 0, 30))).toBeUndefined();
    expect(faceChanged(at(11, 0, 0), at(11, 59, 59))).toBeUndefined();
  });

  test('the port is launched at the half hour of the reference hour, today, in the host zone: the same face', () => {
    for (let hour = 0; hour < 24; hour++) {
      const clock = portClock({ hour }, at(9, 41), 'Etc/Test');
      if (clock._tag !== 'Clock') throw new Error(clock.reason);
      const launched = new Date(clock.epoch);
      expect([launched.getDate(), launched.getHours(), launched.getMinutes()]).toEqual([
        18,
        hour,
        30,
      ]);
      expect(faceAt(launched.getHours())).toBe(faceAt(hour));
      expect(clock.timeZone).toBe('Etc/Test');
    }
  });

  test("a reference taken in the host's zone is reproduced; one taken in another zone is refused", () => {
    expect(portClock({ hour: 11, timeZone: hostZone() }, at(9, 41), hostZone())._tag).toBe('Clock');
    expect(portClock({ hour: 11, timeZone: 'Asia/Tokyo' }, at(9, 41), 'America/New_York')).toEqual({
      _tag: 'Refused',
      reason: 'taken in Asia/Tokyo, the host is in America/New_York',
    });
  });
});
