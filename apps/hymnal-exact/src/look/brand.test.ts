/**
 * The brand is the current hymnal's palette (A2): every role of
 * `apps/hymnal/src/theme.ts` is a token of `app.tamber`, under its own
 * name, with the same colour light and dark, and the brand has no other
 * colour: each of its other tokens sets one of the platform's roles to one
 * of those roles. Generated over the current theme's role names, so a role
 * it gains or changes fails here until the brand follows.
 */

import { describe, expect, it } from 'bun:test';

import { theme } from '@manna/hymnal-app/theme';

import { appFile, brandOf } from './design.testing.ts';

const brand = brandOf(appFile('app.tamber'));
const roles = Object.keys(theme.light);

describe('the brand is the current hymnal’s palette', () => {
  it('has every role of the current theme, light and dark, with its colour', () => {
    expect(roles.length).toBeGreaterThan(20);
    for (const role of roles) {
      const pair = brand.colours.get(role);
      const want = {
        light: theme.light[role as keyof typeof theme.light],
        dark: theme.dark[role as keyof typeof theme.dark],
      };
      expect({ role, light: pair?.light.toLowerCase(), dark: pair?.dark.toLowerCase() }).toEqual({
        role,
        ...want,
      });
    }
  });

  it('has no colour but those, each other token one of the roles', () => {
    expect([...brand.colours.keys()].toSorted()).toEqual(roles.toSorted());
    expect(brand.others).toEqual([]);
    for (const [name, role] of brand.names)
      expect({ name, role, isRole: roles.includes(role) }).toEqual({ name, role, isRole: true });
  });
});
