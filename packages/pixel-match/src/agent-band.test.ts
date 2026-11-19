import { describe, expect, it } from 'bun:test';
import { Option } from 'effect';

import { agentBand, edgeOps } from './agent-band.ts';

const BAND = { top: 'home-band', bottom: 'home-scroll' };

/** The agent's `--json` output of a drive's last ops, as the iOS agent prints them, a reply a line. */
const output = (...replies: ReadonlyArray<string>) =>
  ['$ manna-exact agent ios', '{"settled":true}', ...replies, '{"screenshot":"x.png"}'].join('\n');

const TOP =
  '{"node":{"absolute":{"x":0,"y":168,"w":402,"h":0},"props":{"testId":"home-band"}},"safeArea":{"bottom":34}}';
const TALL_TOP =
  '{"node":{"absolute":{"x":0,"y":168,"w":402,"h":30},"props":{"testId":"home-band"}}}';
const TREE =
  '{"nodes":[{"id":5,"testId":"tabs","x":0,"y":0,"w":0,"h":0},{"id":23,"testId":"home-scroll","x":0,"y":294,"w":402,"h":580,"port":[0,294,402,497]}]}';
const KEYBOARD = '{"visible":true,"overlap":336,"policy":"resize","interactive":false,"top":538}';

describe("the port's band from the agent's layout replies", () => {
  it('runs from the top node’s foot to the scroller’s scrollport foot, in device pixels', () => {
    expect(agentBand(output(TOP, TREE), { band: BAND }, 3)).toEqual(
      Option.some({ top: 504, bottom: 2373 }),
    );
  });

  it('reads the named scroller’s scrollport, not the first scroller’s', () => {
    const twoScrollers =
      '{"nodes":[{"id":4,"testId":"list-scroll","x":0,"y":0,"w":402,"h":900,"port":[0,100,402,300]},{"id":23,"testId":"home-scroll","x":0,"y":294,"w":402,"h":580,"port":[0,294,402,497]}]}';
    expect(agentBand(output(TOP, twoScrollers), { band: BAND }, 3)).toEqual(
      Option.some({ top: 504, bottom: 2373 }),
    );
  });

  it('ends at the top of a node that is not a scroller, under a fixed footer', () => {
    const tree =
      '{"nodes":[{"id":23,"testId":"content","x":0,"y":168,"w":402,"h":380,"port":[0,168,402,380]},{"id":40,"testId":"today-bottom","x":0,"y":791,"w":402,"h":0}]}';
    expect(
      agentBand(output(TOP, tree), { band: { top: 'home-band', bottom: 'today-bottom' } }, 3),
    ).toEqual(Option.some({ top: 504, bottom: 2373 }));
  });

  it('starts at the top node’s top edge when the band says so', () => {
    expect(agentBand(output(TALL_TOP, TREE), { band: BAND }, 3)).toEqual(
      Option.some({ top: 594, bottom: 2373 }),
    );
    expect(agentBand(output(TALL_TOP, TREE), { band: { ...BAND, edge: 'top' } }, 3)).toEqual(
      Option.some({ top: 504, bottom: 2373 }),
    );
  });

  it('ends at the keyboard’s top, from the top of the picture or under the band’s top', () => {
    expect(agentBand(output(KEYBOARD), { keyboard: true }, 3)).toEqual(
      Option.some({ top: 0, bottom: 1614 }),
    );
    expect(agentBand(output(TOP, TREE, KEYBOARD), { band: BAND, keyboard: true }, 3)).toEqual(
      Option.some({ top: 504, bottom: 1614 }),
    );
  });

  it('is none when an edge is not answered, or the keyboard is down', () => {
    expect(Option.isNone(agentBand(output(TOP, '{"nodes":[]}'), { band: BAND }, 3))).toBe(true);
    expect(Option.isNone(agentBand(output('{"error":"no node"}', TREE), { band: BAND }, 3))).toBe(
      true,
    );
    expect(Option.isNone(agentBand('not json', { band: BAND }, 3))).toBe(true);
    expect(
      Option.isNone(agentBand(output('{"visible":false,"overlap":0}'), { keyboard: true }, 3)),
    ).toBe(true);
  });

  it('asks the top node’s box, then the whole tree, then the keyboard', () => {
    expect(edgeOps({ band: BAND })).toEqual(['layout home-band', 'layout']);
    expect(edgeOps({ band: BAND, keyboard: true })).toEqual([
      'layout home-band',
      'layout',
      'state keyboard',
    ]);
    expect(edgeOps({})).toEqual([]);
  });
});
