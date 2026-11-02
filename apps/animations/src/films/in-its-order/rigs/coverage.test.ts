// Each cast member's coverage manifest (`<member>/cutout/coverage.ts`, read by
// `film concept coverage`) names every drawing the cut-out tables draw: each
// member the cut-out table (`CUTOUT`) or the sheet table (`SHEETS`) holds has
// a manifest, each `CUTOUT` view is a puppet entry `<kind>-<view>`, and each
// `SHEETS` kind has at least one entry. A manifest decodes, names each entry
// once, fits a pose only from a puppet entry of its own, and cites only
// beats its script has.

import { describe, expect, test } from 'bun:test';
import { CoverageManifest } from '@manna/film/tools';
import { Schema } from 'effect';
import * as LEAD_FEAST from '../../../library/cast/lead-feast/cutout/coverage.ts';
import * as FEAST_GUEST_MAN from '../../../library/cast/feast-guest-man/cutout/coverage.ts';
import * as FEAST_GUEST_WOMAN from '../../../library/cast/feast-guest-woman/cutout/coverage.ts';
import * as FILLER_BASES from '../../../library/cast/filler-bases/cutout/coverage.ts';
import * as JEREMIAH from '../../../library/cast/jeremiah/cutout/coverage.ts';
import * as PAUL from '../../../library/cast/paul/cutout/coverage.ts';
import * as SOWER from '../../../library/cast/sower/cutout/coverage.ts';
import * as VILLAGER_CHILD from '../../../library/cast/villager-child/cutout/coverage.ts';
import * as VILLAGER_TODDLER from '../../../library/cast/villager-toddler/cutout/coverage.ts';
import * as FEAST_MOTHER from '../cast/feast-mother/cutout/coverage.ts';
import * as IDEA_VILLAGERS from '../cast/idea-villagers/cutout/coverage.ts';
import { script as IN_ITS_ORDER } from '../script.ts';
import { CUTOUT, SHEETS } from './cast.ts';

const MANIFESTS = [
  LEAD_FEAST,
  FEAST_GUEST_MAN,
  FEAST_GUEST_WOMAN,
  FILLER_BASES,
  JEREMIAH,
  PAUL,
  SOWER,
  VILLAGER_CHILD,
  VILLAGER_TODDLER,
  FEAST_MOTHER,
  IDEA_VILLAGERS,
].map((m) => Schema.decodeSync(CoverageManifest)(m.COVERAGE));

const manifestOf = (member: string) => MANIFESTS.find((m) => m.member === member);

/** Each script a manifest may cite, by film name: its beats' ids. */
const BEATS = new Map([['in-its-order', IN_ITS_ORDER.map((beat): string => beat.id)]]);

describe('cast coverage manifests', () => {
  test('every member the cut-out and sheet tables hold has a manifest', () => {
    const members = [...new Set([...Object.keys(CUTOUT), ...Object.keys(SHEETS)])].toSorted();
    expect(members.filter((member) => manifestOf(member) === undefined)).toEqual([]);
    expect(MANIFESTS.map((m) => m.member).toSorted()).toEqual(members);
  });

  test("every cut-out view is a puppet entry of its member's manifest", () => {
    const unnamed = Object.entries(CUTOUT).flatMap(([member, kinds]) =>
      Object.entries(kinds).flatMap(([kind, views]) =>
        Object.keys(views ?? {})
          .map((view) => `${kind}-${view}`)
          .filter((id) => manifestOf(member)?.entries.find((e) => e.id === id)?.cut !== 'puppet')
          .map((id) => `${member} ${id}`),
      ),
    );
    expect(unnamed).toEqual([]);
  });

  test("every sheet kind has an entry in its member's manifest", () => {
    const bare = Object.entries(SHEETS).flatMap(([member, kinds]) =>
      Object.keys(kinds)
        .filter((kind) => !manifestOf(member)?.entries.some((e) => e.id.startsWith(`${kind}-`)))
        .map((kind) => `${member} ${kind}`),
    );
    expect(bare).toEqual([]);
  });

  test('a manifest names each entry once and fits a pose only from its own puppet entry', () => {
    const wrong = MANIFESTS.flatMap((m) => {
      const ids = m.entries.map((e) => e.id);
      const twice = ids
        .filter((id, i) => ids.indexOf(id) !== i)
        .map((id) => `${m.member} ${id} twice`);
      const unfitted = m.entries
        .filter((e) => e.fitted !== undefined)
        .filter((e) => m.entries.find((f) => f.id === e.fitted)?.cut !== 'puppet')
        .map((e) => `${m.member} ${e.id} fitted from ${e.fitted}`);
      return [...twice, ...unfitted];
    });
    expect(wrong).toEqual([]);
  });

  test('every entry cites beats its script has', () => {
    const unknown = MANIFESTS.flatMap((m) =>
      m.entries.flatMap((e) =>
        e.for.flatMap((need) =>
          need.beats
            .filter((beat) => !(BEATS.get(need.script) ?? []).includes(beat))
            .map((beat) => `${m.member} ${e.id} ${need.script}/${beat}`),
        ),
      ),
    );
    expect(unknown).toEqual([]);
    expect(MANIFESTS.every((m) => m.entries.every((e) => e.for.length > 0))).toBe(true);
  });
});
