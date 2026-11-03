import * as BunServices from '@effect/platform-bun/BunServices';
import * as BunCrypto from '@effect/platform-bun/BunCrypto';
import { describe, expect, it } from 'effect-bun-test';
import { Array as Arr, Effect, Layer, Option } from 'effect';
import {
  Ear,
  figure,
  figureOverrides,
  figuresFile,
  figuresRml,
  lockedPrints,
} from '@manna/film/style';
import { unbuilt, unlocked, unsaid } from '@manna/film/style/build';
import { LEDGER } from './build.ts';
import { christ, christFront } from './christ-rig.ts';
import { ARTBOARDS, FIGURES } from './figures.ts';
import { judge } from './judge-rig.ts';
import { PAPERS } from './papers.ts';
import { PROSECUTOR_SPEC, prosecutor } from './prosecutor-rig.ts';
import PROSECUTOR_LOCK from './prosecutor.lock.json' with { type: 'json' };

const here = import.meta.dir;

describe("RBF's figures", () => {
  it.effect.layer(Layer.merge(BunServices.layer, BunCrypto.layerDigest))(
    'are the build of their rigs',
    () =>
      Effect.gen(function* () {
        const stale = yield* unbuilt({
          riv: `${here}/figures.riv`,
          stamp: `${here}/figures.stamp.json`,
          rml: figuresRml(FIGURES),
          main: ARTBOARDS.lead,
        });
        expect(stale).toEqual([]);
      }),
  );

  it.effect(
    "bind every ink stroke to `ink`, each face's brows and mouth too, and follow the shot",
    () =>
      Effect.sync(() => {
        const blocks = (rml: string) =>
          Array.from(
            rml.matchAll(/<Stroke [^>]*name="Ink">([\s\S]*?)<\/Stroke>/g),
            (m) => m[1] ?? '',
          );
        const binds = (rml: string) => blocks(rml).filter((b) => b.includes('propertyKey="47"'));
        expect(FIGURES.baked).toBe(false);
        expect([0, 1].map((scale) => FIGURES.shot.ink?.(scale))).toEqual([1, 0.75]);
        const rml = figuresRml(
          figuresFile({
            weight: FIGURES.weight,
            baked: FIGURES.baked,
            boards: {
              lead: FIGURES.boards.lead,
              leadHand: FIGURES.boards.leadHand,
              judge: FIGURES.boards.judge,
              skinHand: FIGURES.boards.skinHand,
            },
          }),
        );
        expect(blocks(rml).length).toBeGreaterThan(0);
        expect(binds(rml)).toEqual(blocks(rml));
      }),
  );

  it.effect.layer(Layer.merge(BunServices.layer, BunCrypto.layerDigest))(
    'the lead, the judge and the prosecutor are drawn as the owner locked them',
    () =>
      Effect.gen(function* () {
        const locked = lockedPrints(FIGURES);
        expect(locked.map((l) => l.item)).toEqual(['lead', 'judge', 'prosecutor']);
        const held = yield* unlocked(LEDGER, locked);
        expect(held.broken).toEqual([]);
        expect(held.overridden.map((o) => [o.item, o.override.frees])).toEqual([
          ['lead', '55c5cc12ed69f14fef1899ab4f76e574b2fc8dcdd1b440aee09518ac7318a724'],
          ['judge', 'aa08efaef4ab8786975f2daaa68e7897a00dc9ea4be4162709356f6cba689c98'],
          ['prosecutor', '55449cb8729ff73d146a092fd13abf9b9add389ac3b1db60653b072527a760ee'],
        ]);
        expect(prosecutor.hands.paper).toEqual(judge.hands.paper);
      }),
  );

  it.effect.layer(Layer.merge(BunServices.layer, BunCrypto.layerDigest))(
    "a part of a locked figure moved breaks his lock, and an override freeing that very print in the owner's words on another matter frees nothing",
    () =>
      Effect.gen(function* () {
        const changed = yield* unlocked(LEDGER, lockedPrints(laid(figure(MOVED))));
        expect(changed.broken.map((b) => b.item)).toEqual(['prosecutor']);
        expect(changed.overridden.map((o) => o.item)).toEqual(['lead', 'judge']);
        const frees = Option.getOrThrow(Arr.head(changed.broken)).hash;
        const quote = 'ensure Christ has a consistent body, frame, face';
        const quoted = laid(
          figure({
            ...MOVED,
            lock: { ...PROSECUTOR_LOCK, override: { ...OVERRIDE, quote, frees } },
          }),
        );
        const still = yield* unlocked(LEDGER, lockedPrints(quoted));
        expect(still.broken.map((b) => [b.item, b.hash])).toEqual([['prosecutor', frees]]);
        expect(still.broken.map((b) => b.why)).toEqual([
          `prosecutor's lock is broken (FigureLock, a locked figure is drawn as the owner kept it, its print the one its lock holds): prosecutor's override of FigureLock at prosecutor is broken: no decision on his production's ledger at the point item:prosecutor, filed after his lock (2026-10-17T23:57:24.576Z) says "${quote}": file his words as a decision there (\`film production decide\` with \`--quote\`, \`--set\` and \`--point item:prosecutor\`), then quote them verbatim`,
        ]);
        expect(still.overridden.map((o) => o.item)).toEqual(['lead', 'judge']);
      }),
  );

  it.effect(
    "Christ's two views are one figure: His head traced in each, one frame, feet and hands, one robe turned with Him, and one set of knobs",
    () =>
      Effect.sync(() => {
        const views = [christ, christFront].map((f) => f.head._tag === 'TracedHead' && f.head.view);
        expect(views).toEqual(['threeQuarter', 'front']);
        for (const part of ['art', 'stature', 'stance', 'feet', 'hands'] as const)
          expect(christFront[part]).toEqual(christ[part]);
        expect(Object.keys(christFront.knobs)).toEqual(Object.keys(christ.knobs));
        const robe = (f: typeof christ) => [f.body._tag, f.body.paper, f.body.hem];
        expect(robe(christFront)).toEqual(robe(christ));
      }),
  );

  it.effect.layer(Layer.merge(BunServices.layer, BunCrypto.layerDigest))(
    "every override on them cites the owner's word",
    () =>
      Effect.gen(function* () {
        expect(yield* unsaid(LEDGER, figureOverrides(FIGURES))).toEqual([]);
      }),
  );

  it.effect.layer(Layer.merge(BunServices.layer, BunCrypto.layerDigest))(
    "an override in words the owner never said is broken, and so is one in his words on RBF's ledger that are no decision of his on that figure after its lock",
    () =>
      Effect.gen(function* () {
        const quotes = [
          'move his ear back, as the owner asked',
          'lets lock in that style',
          'ensure Christ has a consistent body, frame, face',
          'the ears have an inner border that act as a lighting that the concept doesnt have',
        ];
        for (const quote of quotes)
          expect((yield* unsaid(LEDGER, freed({ quote }))).map((u) => u.item)).toEqual([
            'prosecutor',
          ]);
      }),
  );

  it.effect.layer(Layer.merge(BunServices.layer, BunCrypto.layerDigest))(
    "an override citing an ask no decision on RBF's ledger answered, or the ask the lock was kept in, is broken",
    () =>
      Effect.gen(function* () {
        const ask = (id: string, value: string) =>
          unsaid(LEDGER, freed({ answer: { ask: id, question: 'keep', value } }));
        expect((yield* ask('a0000000000', 'lock')).map((u) => u.item)).toEqual(['prosecutor']);
        for (const value of ['lock', 'revise'])
          expect((yield* ask(PROSECUTOR_LOCK.ask, value)).map((u) => u.item)).toEqual([
            'prosecutor',
          ]);
      }),
  );
});

const laid = (him: typeof prosecutor) =>
  figuresFile({
    weight: FIGURES.weight,
    baked: FIGURES.baked,
    boards: { ...FIGURES.boards, prosecutor: { ...FIGURES.boards.prosecutor, figure: him } },
  });

const MOVED = {
  ...PROSECUTOR_SPEC,
  ear: Ear.Round({ at: [54, 17.5], r: [10, 16.5], paper: PAPERS.ear }),
};

const OVERRIDE = {
  rule: 'FigureLock',
  place: 'prosecutor',
  reason: 'his ear a unit back',
} as const;

const freed = (
  cited:
    | { readonly quote: string }
    | {
        readonly answer: {
          readonly ask: string;
          readonly question: string;
          readonly value: string;
        };
      },
) =>
  figureOverrides(
    laid(
      figure({
        ...PROSECUTOR_SPEC,
        lock: { ...PROSECUTOR_LOCK, override: { ...OVERRIDE, ...cited, frees: 'b'.repeat(64) } },
      }),
    ),
  );
