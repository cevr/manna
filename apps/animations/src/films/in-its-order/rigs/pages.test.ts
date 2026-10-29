import { describe, expect, test } from 'bun:test';
import { pages } from '../../index.ts';
import { CAST, CUTOUT } from './cast.ts';

describe("In Its Order's cast pages", () => {
  test('each member of its cast module (CAST or CUTOUT) has a rig page and a cut-out page in the player', () => {
    const members = [...new Set([...Object.keys(CAST), ...Object.keys(CUTOUT)])];
    const missing = members.flatMap((member) =>
      [`in-its-order/cast/${member}`, `in-its-order/cast/${member}/cutout`].filter(
        (key) => !Object.hasOwn(pages, key),
      ),
    );
    expect(members.length).toBeGreaterThan(0);
    expect(missing).toEqual([]);
  });
});
