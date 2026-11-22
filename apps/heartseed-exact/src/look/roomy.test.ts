/**
 * Where the port departs from the current Heartseed on purpose (owner,
 * q160): at the accessibility text sizes alone. The threshold is Exact's
 * one fact for them, `exactViewport().accessibilityTextSize` (UIKit's
 * accessibility category, a body of 28 pt or more; false on the web), read
 * once by each screen that departs, and nothing else gates a departure. The
 * table names, for each screen, the layout each side of the threshold gets;
 * `tools/drive-largest.ts ios` holds what is drawn.
 *
 * It reads contract text because a Contract view cannot ask a TypeScript
 * function synchronously: a source's answer comes from the data module,
 * which every host asks again after the first pixel (Exact's
 * `docs/contract-for-agents.md`, "A first-frame value is not the answer"),
 * so a choice made there would draw the default layout at an accessibility
 * size and then jump. It catches a departure read from another fact, a gate
 * flipped or dropped, and a part given the wrong round button. It cannot see
 * what is drawn: a second draw of a part beside a kept line passes it, which
 * `tools/drive-largest.ts web` holds below the threshold.
 */

import { describe, expect, it } from 'bun:test';

import { readContracts } from '../../tools/look';

const contracts = readContracts();

/** Each departure: its file, the fact's resource there, and each layout's line, below and at the threshold. */
const DEPARTURES = [
  {
    screen: "Today's foot",
    file: 'features/today.contract',
    fact: 'todaySize',
    below: 'part=(todaySize.accessibilityTextSize ? "main" : "all")',
    at: 'if todaySize.accessibilityTextSize and todayFootShown(today) and',
  },
  {
    screen: "a list's head",
    file: 'features/list.contract',
    fact: 'listSize',
    below: 'if not listSize.accessibilityTextSize',
    at: 'if listSize.accessibilityTextSize',
  },
] as const;

/** Which round button each part of Today's foot draws: the circle in `all`, the capsule in `main` and `rest`. */
const ROUND = [
  { part: 'all', roomy: 'roomy=false' },
  { part: 'main', roomy: 'roomy=(part == "main")' },
  { part: 'rest', roomy: 'roomy=true, id="stop"' },
  { part: 'rest', roomy: 'roomy=true, id="hear"' },
] as const;

const text = (file: string) => contracts.get(file) ?? '';

/** The lines of a component, from its `component` line to the next top-level line. */
const component = (file: string, name: string) => {
  const lines = [...text(file).split('\n'), 'end'];
  const start = lines.indexOf(`component ${name}`);
  return lines.slice(
    start,
    lines.findIndex((line, at) => at > start && /^\S/u.test(line)),
  );
};

describe('the accessibility-size departures', () => {
  it.each(DEPARTURES)('$screen reads the one fact once', ({ file, fact }) => {
    const reads = text(file).match(/resource \w+ = exactViewport\(\) as shape \w+/gu) ?? [];
    expect(reads).toEqual([expect.stringContaining(`resource ${fact} = exactViewport()`)]);
    expect(text(file)).toMatch(/^\s+accessibilityTextSize: bool$/mu);
  });

  it.each(DEPARTURES)(
    '$screen has one layout each side of the threshold',
    ({ file, below, at }) => {
      expect(text(file)).toContain(below);
      expect(text(file)).toContain(at);
    },
  );

  it('no Contract file gates a layout on a text size of its own', () => {
    for (const [path, body] of contracts) {
      expect({
        path,
        sized: /prefer root-font-size|rootFontSize|setRootFontSize/u.test(body),
      }).toEqual({
        path,
        sized: false,
      });
    }
  });

  it.each(ROUND)("the foot's $part part draws its round buttons with $roomy", ({ roomy }) => {
    expect(component('features/today.contract', 'TodayFoot').join('\n')).toContain(roomy);
  });

  it("the welcome's one-word title is One's below the threshold and the name's size at it", () => {
    const first = text('features/first.contract');
    expect(first.match(/resource \w+ = exactViewport\(\) as shape \w+/gu)).toEqual([
      'resource firstSize = exactViewport() as shape TodayTextSize',
    ]);
    expect(first).toMatch(
      /if firstSize\.accessibilityTextSize\n\s+text "Heartseed" [^\n]*font="type\.name"[^\n]*\n\s+else\n\s+text "Heartseed" [^\n]*font="type\.title"/u,
    );
  });

  it('a round button is the circle below the threshold and the capsule at it', () => {
    const big = component('features/today.contract', 'TodayBig').join('\n');
    expect(big).toMatch(/if roomy\n\s+TodayWide\([^\n]*\n\s+else\n\s+TodayRound\(/u);
  });
});
