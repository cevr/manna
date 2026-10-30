import { describe, expect, test } from 'bun:test';
import { Cause, Effect, Exit, Layer } from 'effect';
import { HttpClient, HttpClientResponse } from 'effect/http';
import {
  CUTOUT_BOILS,
  CUTOUT_MARGIN,
  type CastModule,
  type CutoutView,
  castPage,
} from '../canvas/cast.ts';
import { castPages } from './cast.ts';

/** A film whose one member, the sower, has a cut-out (`CUTOUT`) and no rig (`CAST`). */
const cutOnly: CastModule = {
  SHEETS: { sower: { turnaround: { width: 40, height: 60, scale: 1 } } },
  PAPER: { base: '#fff', tone: '#eee', seed: 1 },
  CUTOUT: { sower: { turnaround: {} } },
};

const pages = castPages('film', ['sower'], () => Promise.resolve(cutOnly));
const open = (key: string) => {
  const page = pages[key];
  if (page === undefined) throw new Error(`no page ${key}`);
  return Effect.runPromiseExit(Effect.scoped(page));
};

describe("a cut-out member's cast pages", () => {
  test('his cut-out page builds his film, a scene a sheet, the sheet grown by the margin', async () => {
    const exit = await open(castPage('film', 'sower', 'cutout'));
    if (!Exit.isSuccess(exit)) throw new Error(Cause.pretty(exit.cause));
    expect(exit.value.width).toBe(40 + 2 * CUTOUT_MARGIN[0]);
    expect(exit.value.height).toBe(60 + 2 * CUTOUT_MARGIN[1]);
  });

  test("his cut-out page loads his view's puppet: each of its parts is asked for through the page's client", async () => {
    const asked: string[] = [];
    const http = Layer.succeed(
      HttpClient.HttpClient,
      HttpClient.make((request, url) =>
        Effect.sync(() => {
          asked.push(url.pathname);
          return HttpClientResponse.fromWeb(request, new Response(null, { status: 404 }));
        }),
      ),
    );
    const front: CutoutView = {
      box: [0, 0, 40, 60],
      at: [20, 58],
      puppet: {
        key: 'film/sower/front',
        size: [40, 60],
        parts: [
          { name: 'arm', png: 'https://cast.test/sower/front/arm.png' },
          { name: 'body', png: 'https://cast.test/sower/front/body.png' },
        ],
        skeleton: {
          bones: [{ name: 'lean', pivot: [20, 58], tip: [20, 10] }],
          skin: { arm: ['lean'], body: ['lean'] },
        },
        origin: [20, 58],
      },
      pose: { numbers: {}, root: [20, 58], scale: 1 },
    };
    const withView = castPages(
      'film',
      ['sower'],
      () => Promise.resolve({ ...cutOnly, CUTOUT: { sower: { turnaround: { front } } } }),
      http,
    );
    const page = withView[castPage('film', 'sower', 'cutout')];
    if (page === undefined) throw new Error('no cut-out page');
    const exit = await Effect.runPromiseExit(Effect.scoped(page));
    expect(asked[0]).toBe('/sower/front/arm.png');
    if (Exit.isSuccess(exit)) throw new Error('a puppet whose parts answer 404 loaded');
    expect(Cause.pretty(exit.cause)).toContain('PuppetUnloadable');
  });

  test('his rig page refuses, and names his cut-out page', async () => {
    const exit = await open(castPage('film', 'sower'));
    if (Exit.isSuccess(exit)) throw new Error('the rig page of a member with no rig opened');
    expect(Cause.pretty(exit.cause)).toContain(
      "film's rigs/cast.ts has no rigs of sower (CAST): his figure is his cut-out, film/cast/sower/cutout",
    );
  });
});

/** The sower again, with a portrait single drawing beside his landscape turnaround. */
const portrait: CastModule = {
  ...cutOnly,
  SHEETS: { sower: { ...cutOnly.SHEETS['sower'], single: { width: 30, height: 70, scale: 1 } } },
  CUTOUT: { sower: { turnaround: {}, single: {} } },
};

describe('a cut-out member whose sheets are of two sizes', () => {
  const sized = castPages('film', ['sower'], () => Promise.resolve(portrait));
  const film = async (key: string) => {
    const page = sized[key];
    if (page === undefined) throw new Error(`no page ${key}`);
    const exit = await Effect.runPromiseExit(Effect.scoped(page));
    if (!Exit.isSuccess(exit)) throw new Error(Cause.pretty(exit.cause));
    return {
      size: [exit.value.width, exit.value.height],
      scenes: exit.value.placed.map((p) => p.spec.id),
    };
  };

  test('his cut-out page draws only the kinds the size of his first, on their canvas', async () => {
    expect(await film(castPage('film', 'sower', 'cutout'))).toEqual({
      size: [40 + 2 * CUTOUT_MARGIN[0], 60 + 2 * CUTOUT_MARGIN[1]],
      scenes: ['turnaround'],
    });
  });

  test('a kind of another size draws on its own page, at its own sheet size, at each boil', async () => {
    const drawn = await Promise.all(
      CUTOUT_BOILS.map((boil) => film(castPage('film', 'sower', 'cutout', boil, 'single'))),
    );
    expect(drawn).toEqual(
      CUTOUT_BOILS.map(() => ({
        size: [30 + 2 * CUTOUT_MARGIN[0], 70 + 2 * CUTOUT_MARGIN[1]],
        scenes: ['single'],
      })),
    );
  });
});
