import { describe, expect, it } from 'bun:test';
import { Option } from 'effect';

import { agentBand, bandOps } from './agent-band.ts';

const BAND = { top: 'home-band', bottom: 'home-scroll' };

/** The agent's `--json` output of a banded drive's last ops, as the iOS agent prints them, a reply a line. */
const output = (top: string, tree: string) =>
  ['$ manna-exact agent ios', '{"settled":true}', top, tree, '{"screenshot":"x.png"}'].join('\n');

const TOP =
  '{"node":{"absolute":{"x":0,"y":168,"w":402,"h":0},"props":{"testId":"home-band"}},"safeArea":{"bottom":34}}';
const TREE =
  '{"nodes":[{"id":5,"testId":"tabs","x":0,"y":0,"w":0,"h":0},{"id":23,"testId":"home-scroll","x":0,"y":294,"w":402,"h":580,"port":[0,294,402,497]}]}';

describe("the port's band from the agent's layout replies", () => {
  it('runs from the top node’s foot to the scroller’s scrollport foot, in device pixels', () => {
    expect(agentBand(output(TOP, TREE), BAND, 3)).toEqual(Option.some({ top: 504, bottom: 2373 }));
  });

  it('is none when the scroller has no scrollport or the top node is not answered', () => {
    expect(Option.isNone(agentBand(output(TOP, '{"nodes":[]}'), BAND, 3))).toBe(true);
    expect(Option.isNone(agentBand(output('{"error":"no node"}', TREE), BAND, 3))).toBe(true);
    expect(Option.isNone(agentBand('not json', BAND, 3))).toBe(true);
  });

  it('asks the top node’s box, then the whole tree', () => {
    expect(bandOps(BAND)).toEqual(['layout home-band', 'layout']);
  });
});
