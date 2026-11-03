import { describe, expect, it } from 'bun:test';
import { Option } from 'effect';

import { color } from '~/color';
import { hymnAt } from '~/hymns/hymns';
import { type StackRoute, stackOptions } from '~/stack';

import { stackHeaders } from './screen';

const optionsOf = (route: StackRoute) => stackOptions('accent', stackHeaders)({ route });

const optionsAt = (params: StackRoute['params']) => optionsOf({ name: 'hymns/[number]', params });

const titleOf = (n: string) => Option.getOrThrow(hymnAt(n)).title;

describe('the hymn route’s header', () => {
  it('is keyed by the name the stack gives the route file', () => {
    for (const name of Object.keys(stackHeaders))
      // oxlint-disable-next-line effect/noGlobals -- the route's file is the app's own source, which the router names each screen by.
      expect(Bun.file(`${import.meta.dir}/../../app/(hymnal)/${name}.tsx`).size).toBeGreaterThan(0);
  });

  it('names the route’s hymn, on the ground, with no buttons: the reader’s controls are at the thumb', () => {
    for (const n of ['1', '3', '600', '601', '695']) {
      const options = optionsAt({ number: n });
      expect(options.title).toBe(titleOf(n));
      expect(options.headerStyle).toEqual({ backgroundColor: color.ground });
      expect('headerRight' in options).toBe(false);
    }
  });

  it('names a number with no hymn as missing, on the ground, with no buttons', () => {
    for (const [params, title] of [
      [{ number: '9999' }, 'No hymn 9999'],
      [{ number: 'abc' }, 'No hymn abc'],
      [{ number: 3 }, 'No hymn'],
      [{}, 'No hymn'],
    ] as const) {
      const options = optionsAt(params);
      expect(options.title).toBe(title);
      expect(options.headerStyle).toEqual({ backgroundColor: color.ground });
      expect('headerRight' in options).toBe(false);
    }
    expect(optionsOf({ name: 'hymns/[number]' }).title).toBe('No hymn');
  });

  it('leaves the other screens their own title, on the ground', () => {
    const options = optionsOf({ name: 'index' });
    expect('title' in options).toBe(false);
    expect(options.headerStyle).toEqual({ backgroundColor: color.ground });
  });
});
