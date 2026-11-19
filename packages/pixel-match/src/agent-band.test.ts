import { describe, expect, it } from 'bun:test';
import { Option } from 'effect';

import { agentBand, edgeOps } from './agent-band.ts';

const BAND = { top: 'home-band', bottom: 'home-scroll' };

/** The agent's `--json` output of a drive's last ops, as the iOS agent prints them, a reply a line. */
const output = (...replies: ReadonlyArray<string>) =>
  ['$ manna-exact agent ios', '{"settled":true}', ...replies, '{"screenshot":"x.png"}'].join('\n');

/** A whole-tree `layout` reply with the given nodes, in the screen's points. */
const tree = (...nodes: ReadonlyArray<string>) => `{"nodes":[${nodes.join(',')}]}`;

const TOP = '{"id":7,"testId":"home-band","x":0,"y":168,"w":402,"h":0}';
const TALL_TOP = '{"id":7,"testId":"home-band","x":0,"y":168,"w":402,"h":30}';
const SCROLL =
  '{"id":23,"testId":"home-scroll","x":0,"y":294,"w":402,"h":580,"port":[0,294,402,497]}';
const TREE = tree(TOP, SCROLL);
const KEYBOARD = '{"visible":true,"overlap":336,"policy":"resize","interactive":false,"top":538}';

describe("the port's band from the agent's layout reply", () => {
  it('runs from the top node’s foot to the scroller’s scrollport foot, in device pixels', () => {
    expect(agentBand(output(TREE), { band: BAND }, 3)).toEqual(
      Option.some({ top: 504, bottom: 2373 }),
    );
  });

  it('reads the named scroller’s scrollport, not the first scroller’s', () => {
    const twoScrollers = tree(
      '{"id":4,"testId":"list-scroll","x":0,"y":0,"w":402,"h":900,"port":[0,100,402,300]}',
      TOP,
      SCROLL,
    );
    expect(agentBand(output(twoScrollers), { band: BAND }, 3)).toEqual(
      Option.some({ top: 504, bottom: 2373 }),
    );
  });

  it('ends at the top of a node that is not a scroller, under a fixed footer', () => {
    const today = tree(
      TOP,
      '{"id":23,"testId":"content","x":0,"y":168,"w":402,"h":380,"port":[0,168,402,380]}',
      '{"id":40,"testId":"today-bottom","x":0,"y":791,"w":402,"h":0}',
    );
    expect(
      agentBand(output(today), { band: { top: 'home-band', bottom: 'today-bottom' } }, 3),
    ).toEqual(Option.some({ top: 504, bottom: 2373 }));
  });

  it('starts at the top node’s top edge when the band says so', () => {
    const tall = tree(TALL_TOP, SCROLL);
    expect(agentBand(output(tall), { band: BAND }, 3)).toEqual(
      Option.some({ top: 594, bottom: 2373 }),
    );
    expect(agentBand(output(tall), { band: { ...BAND, edge: 'top' } }, 3)).toEqual(
      Option.some({ top: 504, bottom: 2373 }),
    );
  });

  it('starts at a top node inside a scroller where the screen shows it, not where its scroller’s content holds it', () => {
    const about = { top: 'about-lead', bottom: 'about-list', edge: 'top' as const };
    const layoutOfLead =
      '{"node":{"absolute":{"x":32.3,"y":67.33,"w":337.3,"h":36},"props":{"testId":"about-lead"}}}';
    const lifted = tree(
      '{"id":30,"testId":"about-list","x":0,"y":62,"w":402,"h":812,"port":[0,132,402,708]}',
      '{"id":31,"testId":"about-lead","x":32.3,"y":199.33,"w":337.3,"h":36}',
    );
    expect(agentBand(output(layoutOfLead, lifted), { band: about }, 3)).toEqual(
      Option.some({ top: 597.99, bottom: 2520 }),
    );
  });

  it('ends at the keyboard’s top, from the top of the picture or under the band’s top', () => {
    expect(agentBand(output(KEYBOARD), { keyboard: true }, 3)).toEqual(
      Option.some({ top: 0, bottom: 1614 }),
    );
    expect(agentBand(output(TREE, KEYBOARD), { band: BAND, keyboard: true }, 3)).toEqual(
      Option.some({ top: 504, bottom: 1614 }),
    );
  });

  it('is none when an edge is not answered, or the keyboard is down', () => {
    expect(Option.isNone(agentBand(output(tree(SCROLL)), { band: BAND }, 3))).toBe(true);
    expect(Option.isNone(agentBand(output(tree(TOP)), { band: BAND }, 3))).toBe(true);
    expect(Option.isNone(agentBand(output('{"error":"no node"}'), { band: BAND }, 3))).toBe(true);
    expect(Option.isNone(agentBand('not json', { band: BAND }, 3))).toBe(true);
    expect(
      Option.isNone(agentBand(output('{"visible":false,"overlap":0}'), { keyboard: true }, 3)),
    ).toBe(true);
  });

  it('asks the whole tree, then the keyboard', () => {
    expect(edgeOps({ band: BAND })).toEqual(['layout']);
    expect(edgeOps({ band: BAND, keyboard: true })).toEqual(['layout', 'state keyboard']);
    expect(edgeOps({})).toEqual([]);
  });
});
