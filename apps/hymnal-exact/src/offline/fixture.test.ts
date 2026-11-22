/* oxlint-disable effect/noAsyncFunction, effect/noGlobals -- the fixture is a Bun server's handler, driven here with the requests the contract tests and the app send it. */

/**
 * The recordings' fixture as the Downloads tests use it (`tools/recordings.ts`):
 * it counts each recording's `GET`s and answers a count asked by
 * `POST /control`, and refuses or cuts off a hymn's recording until it is
 * mended.
 */

import { describe, expect, it } from 'bun:test';

import { type Ask, controlOf, serverOf } from '../../tools/recordings.ts';

const AT = 'http://127.0.0.1:4797';
const PATH = '/audio/warm-1/sdah/1.mp3';

const control = (handler: ReturnType<typeof serverOf>, body: Ask) =>
  handler(new Request(`${AT}/control`, { method: 'POST', body: JSON.stringify(body) }));

describe('the recordings fixture under a test’s control', () => {
  it('counts each recording’s GETs and answers 200 for the count asked, 409 for another', async () => {
    const handler = serverOf(controlOf());
    expect((await control(handler, { action: 'count', path: PATH, is: 0 })).status).toBe(200);
    await (await handler(new Request(`${AT}${PATH}`))).arrayBuffer();
    await handler(new Request(`${AT}${PATH}`, { method: 'HEAD' }));
    expect((await control(handler, { action: 'count', path: PATH, is: 1 })).status).toBe(200);
    const other = await control(handler, { action: 'count', path: PATH, is: 2 });
    expect([other.status, await other.text()]).toEqual([409, '1']);
  });

  it('refuses a hymn’s recording, cuts its body off halfway, and serves it whole once mended', async () => {
    const handler = serverOf(controlOf());
    await control(handler, { action: 'refuse', hymn: 1 });
    expect((await handler(new Request(`${AT}${PATH}`))).status).toBe(503);
    await control(handler, { action: 'mend', hymn: 1 });
    await control(handler, { action: 'cut', hymn: 1 });
    const cut = await handler(new Request(`${AT}${PATH}`));
    expect(cut.status).toBe(200);
    expect(cut.arrayBuffer()).rejects.toThrow();
    await control(handler, { action: 'mend', hymn: 1 });
    const whole = await handler(new Request(`${AT}${PATH}`));
    expect((await whole.arrayBuffer()).byteLength).toBe(
      Number(whole.headers.get('content-length')),
    );
  });
});
