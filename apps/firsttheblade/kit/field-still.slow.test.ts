import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Array as Arr, Effect, FileSystem, Match, Option, Path, Stream } from 'effect';
import * as ChildProcess from 'effect/process/ChildProcess';
import { ChildProcessSpawner } from 'effect/process/ChildProcessSpawner';
import sharp from 'sharp';

import { ASPECT } from '../src/motion/sun.ts';
import { RECORD, type Unapproved, readRecord, servedStills, unapproved } from './approval.ts';
import {
  type Pixels,
  QUALITY,
  REPAINT_TO,
  at,
  skyMask,
  withSunLight,
  withoutRays,
} from './field-paint.ts';
import { scratchApp } from './scratch-app.ts';
import { IMAGE, OUTSIDE, servedImages } from './served.ts';

const test = it.effect.layer(BunServices.layer);

const APP = `${import.meta.dir}/..`;

const WIDTHS = [768, 1536, 3072] as const;

const KIT_QUALITY = Math.round(QUALITY * 100);

const draws = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
};

const decoded = (input: string | Uint8Array, width: Option.Option<number> = Option.none()) =>
  Effect.gen(function* () {
    const sized = Option.match(width, {
      onNone: () => sharp(input),
      onSome: (wide) => sharp(input).resize({ width: wide }),
    });
    const { data, info } = yield* Effect.promise(() =>
      sized.ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
    );
    const pixels: Pixels = {
      width: info.width,
      height: info.height,
      data: new Uint8ClampedArray(data),
    };
    return pixels;
  });

interface Encoding {
  readonly lossless: boolean;
  readonly quality: number;
}

const encoded = (still: string, image: Pixels, { lossless, quality }: Encoding) => {
  const raw = sharp(Buffer.from(image.data), {
    raw: { width: image.width, height: image.height, channels: 4 },
  });
  const coded = Match.value(still.slice(still.lastIndexOf('.') + 1)).pipe(
    Match.when('webp', () => raw.webp({ lossless, quality, effort: 0 })),
    Match.when('png', () => raw.png({ compressionLevel: Math.round(quality / 12) })),
    Match.orElse(() => raw.jpeg({ quality })),
  );
  return Effect.map(
    Effect.promise(() => coded.toBuffer()),
    (bytes) => new Uint8Array(bytes),
  );
};

interface Change {
  readonly name: string;
  readonly writes: ReadonlyArray<readonly [string, Option.Option<Uint8Array>]>;
}

const written = (name: string, file: string, bytes: Uint8Array): Change => ({
  name,
  writes: [[file, Option.some(bytes)]],
});

const foundAfter = Effect.fn('FieldStill.foundAfter')(function* (
  root: string,
  changes: ReadonlyArray<Change>,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const found: Array<readonly [string, ReadonlyArray<Unapproved>]> = [];
  for (const change of changes) {
    const files = change.writes.map(([file]) => path.join(root, file));
    const kept = yield* Effect.forEach(files, (file) =>
      Effect.when(fs.readFile(file), fs.exists(file)),
    );
    const put = (writes: ReadonlyArray<Option.Option<Uint8Array>>) =>
      Effect.forEach(files, (file, i) =>
        Option.match(writes[i] ?? Option.none(), {
          onNone: () => fs.remove(file, { force: true }),
          onSome: (bytes) =>
            Effect.andThen(fs.makeDirectory(path.dirname(file), { recursive: true }), () =>
              fs.writeFile(file, bytes),
            ),
        }),
      );
    yield* put(change.writes.map(([, bytes]) => bytes));
    found.push([change.name, yield* unapproved(root)]);
    yield* put(kept);
  }
  return found;
});

interface StillChanges {
  readonly changes: ReadonlyArray<Change>;
  readonly moved: readonly [string, boolean];
}

const codesApart = (a: Pixels, b: Pixels) => {
  let apart = 0;
  for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) apart++;
  return apart;
};

const movedPixel = Effect.fn('FieldStill.movedPixel')(function* (
  still: string,
  image: Pixels,
  next: () => number,
) {
  const pixel = Math.floor(next() * image.width * image.height);
  const channel = Math.floor(next() * 3);
  const code = at(image.data, pixel * 4 + channel);
  const movedBy = (by: number, encoding: Encoding) => {
    const data = new Uint8ClampedArray(image.data);
    data[pixel * 4 + channel] = code + by - 2 * by * Number(code + by > 255);
    return encoded(still, { ...image, data }, encoding);
  };
  const named = (by: number) => `pixel ${pixel} channel ${channel} moved by ${by}`;
  if (!/\.jpe?g$/i.test(still)) {
    const bytes = yield* movedBy(1, { lossless: true, quality: 1 });
    const survives = codesApart(yield* decoded(bytes), image) === 1;
    return { name: named(1), bytes, survives };
  }
  const encoding = { lossless: true, quality: 100 };
  const control = yield* encoded(still, image, encoding);
  let by = 1;
  let bytes = yield* movedBy(by, encoding);
  while (Buffer.from(bytes).equals(Buffer.from(control)) && by < 128) {
    by *= 2;
    bytes = yield* movedBy(by, encoding);
  }
  return { name: named(by), bytes, survives: !Buffer.from(bytes).equals(Buffer.from(control)) };
});

const changesOf = Effect.fn('FieldStill.changesOf')(function* (
  still: string,
  others: ReadonlyArray<string>,
  next: () => number,
) {
  const fs = yield* FileSystem.FileSystem;
  const bytes = yield* fs.readFile(`${APP}/${still}`);
  const flips = Array.from({ length: 3 }, () => {
    const offset = Math.floor(next() * bytes.length);
    const by = 1 + Math.floor(next() * 255);
    const flipped = Uint8Array.from(bytes);
    flipped[offset] = at(flipped, offset) ^ by;
    return written(`${still}: byte ${offset} xor ${by}`, still, flipped);
  });
  const image = yield* decoded(bytes);
  const quality = Math.round(40 + next() * 59);
  const again = yield* encoded(still, image, { lossless: false, quality });
  const moved = yield* movedPixel(still, image, next);
  const swap = others[Math.floor(next() * others.length)] ?? still;
  const changes: ReadonlyArray<Change> = [
    ...flips,
    written(`${still}: encoded again at quality ${quality}`, still, again),
    written(`${still}: ${moved.name}`, still, moved.bytes),
    written(`${still}: swapped for ${swap}`, still, yield* fs.readFile(`${APP}/${swap}`)),
    { name: `${still}: dropped`, writes: [[still, Option.none()]] },
  ];
  const result: StillChanges = {
    changes,
    moved: [`${still}: ${moved.name}`, moved.survives],
  };
  return result;
});

const refusedEach = (found: ReadonlyArray<readonly [string, ReadonlyArray<Unapproved>]>) =>
  found.map(([name, problems]) => [name, problems.length] as const);

type Colour = readonly [number, number, number];

const WHITE: Colour = [255, 255, 255];
const GOLD: Colour = [255, 210, 90];

interface Ray {
  readonly u: number;
  readonly v: number;
  readonly angle: number;
  readonly halfWidth: number;
  readonly reach: number;
  readonly colour: Colour;
}

const withRay = (still: Pixels, sky: Uint8Array, ray: Ray, strength: number): Pixels => {
  const { width, height } = still;
  const data = new Uint8ClampedArray(still.data);
  const along = [Math.cos(ray.angle), Math.sin(ray.angle)] as const;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (sky[i] === 0) continue;
      const du = (x + 0.5) / width - ray.u;
      const dv = ((y + 0.5) / height - ray.v) / ASPECT;
      const out = du * along[0] + dv * along[1];
      const off = Math.abs(dv * along[0] - du * along[1]) / ray.halfWidth;
      if (out < 0 || off > 2.5) continue;
      const a = strength * Math.exp(-2 * off * off - out / ray.reach);
      for (let k = 0; k < 3; k++) {
        const c = at(data, i * 4 + k);
        data[i * 4 + k] = c + a * (at(ray.colour, k) - c);
      }
    }
  return { width, height, data };
};

const mixed = (from: Pixels, to: Pixels, t: number): Pixels => {
  const data = new Uint8ClampedArray(from.data.length);
  for (let i = 0; i < data.length; i++) {
    const c = at(from.data, i);
    data[i] = Math.round(c + t * (at(to.data, i) - c));
  }
  return { ...from, data };
};

const beams = (still: Pixels, sky: Uint8Array, colour: Colour): Pixels => {
  const { width, height } = still;
  const data = new Uint8ClampedArray(still.data);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const angle = Math.atan2(y / height, x / width);
      const inBeam = Math.abs(angle - 1.05) < 0.06 || Math.abs(angle - 1.3) < 0.035;
      if (sky[y * width + x] === 1 && x / width < 0.34 && inBeam)
        data.set(colour, (y * width + x) * 4);
    }
  return { width, height, data };
};

const skyless = (still: Pixels, sky: Uint8Array): Pixels => {
  const data = new Uint8ClampedArray(still.data);
  for (let i = 0; i < sky.length; i++) if (sky[i] === 1) data.set([120, 150, 110], i * 4);
  return { ...still, data };
};

const kitLit = (master: Pixels) => {
  const sky = skyMask(master);
  return {
    lit: withSunLight(master, sky),
    repainted: withSunLight(withoutRays(master, sky), sky),
  };
};

const kitStill = ({ lit, repainted }: ReturnType<typeof kitLit>, reach: number, weight: number) => {
  const { width } = lit;
  const to = reach * REPAINT_TO * width;
  const feather = Math.max(1, Math.round((48 * width) / 3072));
  const data = new Uint8ClampedArray(lit.data);
  for (let j = 0; j < data.length; j++) {
    const x = (j >> 2) % width;
    const share = weight * Math.min(1, Math.max(0, 1 - (x - to) / feather));
    if (share > 0) data[j] = at(lit.data, j) + share * (at(repainted.data, j) - at(lit.data, j));
  }
  return { ...lit, data };
};

const MASTER = `${import.meta.dir}/art/field.webp`;
const stillAt = (width: number) => `src/art/field-${width}.webp`;

const BASE = 'c56180093';

const baseStill = (width: number) =>
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner;
    const shown = yield* spawner.spawn(
      ChildProcess.make('git', ['show', `${BASE}:apps/firsttheblade/${stillAt(width)}`], {
        cwd: APP,
        forceKillAfter: '5 seconds',
      }),
    );
    const [chunks, code] = yield* Effect.all([Stream.runCollect(shown.stdout), shown.exitCode], {
      concurrency: 2,
    });
    if (code !== 0) return yield* Effect.die(new Error(`git show ${BASE} ${stillAt(width)}`));
    const bytes = new Uint8Array(chunks.reduce((length, chunk) => length + chunk.length, 0));
    chunks.reduce((at, chunk) => {
      bytes.set(chunk, at);
      return at + chunk.length;
    }, 0);
    return bytes;
  }).pipe(Effect.scoped);

const resized = (image: Pixels, width: number) =>
  Effect.map(
    Effect.promise(() =>
      sharp(Buffer.from(image.data), {
        raw: { width: image.width, height: image.height, channels: 4 },
      })
        .resize({ width })
        .raw()
        .toBuffer({ resolveWithObject: true }),
    ),
    ({ data, info }): Pixels => ({
      width: info.width,
      height: info.height,
      data: new Uint8ClampedArray(data),
    }),
  );

const withoutRaysAs = (
  image: Pixels,
  sky: Uint8Array,
  lit: Pixels,
  repaintTo: number,
  weight: number,
) => {
  const { width, height } = image;
  const out = new Uint8ClampedArray(image.data);
  const from = Math.round(0.42 * width);
  const span = Math.round(0.62 * width) - from;
  const last = Math.round(0.466 * height);
  const to = Math.round(repaintTo * width);
  const feather = Math.max(1, Math.round((48 * width) / 3072));
  for (let y = 0; y < height; y++) {
    const row = Math.max(0, y - 2 * Math.max(0, y - last));
    for (let x = 0; x < to + feather; x++) {
      const i = y * width + x;
      if (sky[i] === 0) continue;
      const m = x % (2 * span);
      const sx = from + Math.min(m, 2 * span - 1 - m);
      const j = row * width + sx;
      const w = weight * Math.min(1, Math.max(0, 1 - (x - to) / feather));
      for (let k = 0; k < 3; k++)
        out[i * 4 + k] = w * at(image.data, j * 4 + k) + (1 - w) * at(image.data, i * 4 + k);
    }
  }
  const across = Math.min(width, to + feather);
  const repainted = new Uint8Array(sky.length);
  for (let y = 0; y < height; y++)
    repainted.set(sky.subarray(y * width, y * width + across), y * width);
  const relit = withSunLight({ width, height, data: out }, repainted);
  const data = new Uint8ClampedArray(lit.data);
  for (let y = 0; y < height; y++)
    data.set(relit.data.subarray(y * width * 4, (y * width + across) * 4), y * width * 4);
  return { width, height, data };
};

const earlierLights = Effect.fn('FieldStill.earlierLights')(function* () {
  const [head768, head3072, base768, master, master768, master1536] = yield* Effect.all(
    [
      decoded(`${APP}/${stillAt(768)}`),
      decoded(`${APP}/${stillAt(3072)}`),
      Effect.flatMap(baseStill(768), (bytes) => decoded(bytes)),
      Effect.flatMap(baseStill(3072), (bytes) => decoded(bytes)),
      decoded(MASTER, Option.some(768)),
      decoded(MASTER, Option.some(1536)),
    ],
    { concurrency: 6 },
  );
  const headSky = skyMask(head768);
  const masterSky768 = skyMask(master768);
  const masterSky3072 = skyMask(master);
  const masterLit = withSunLight(master, masterSky3072);
  const regressed = (repaintTo: number, weight: number) =>
    resized(withoutRaysAs(master, masterSky3072, masterLit, repaintTo, weight), 768);
  const kit1536 = kitLit(master1536);
  const [repaint3, repaint2, weight7, weight5] = yield* Effect.all(
    [regressed(0.3, 1), regressed(0.2, 1), regressed(REPAINT_TO, 0.7), regressed(REPAINT_TO, 0.5)],
    { concurrency: 4 },
  );
  const thin = (width: number, colour: Colour): Ray => ({
    u: 0.02,
    v: 0.05,
    angle: 0.35,
    halfWidth: 0.6 / width,
    reach: 2,
    colour,
  });
  const lights: ReadonlyArray<readonly [string, number, Pixels]> = [
    ['r2: head 0.3 toward the old still', 768, mixed(head768, base768, 0.3)],
    ['r2: head 0.4 toward the old still', 768, mixed(head768, base768, 0.4)],
    ['r2: gold beams', 768, beams(head768, headSky, GOLD)],
    ['r2: white beams', 768, beams(head768, headSky, WHITE)],
    ['r2: the kit repainting to 0.3 of the width', 768, repaint3],
    ['r2: the kit repainting to 0.2 of the width', 768, repaint2],
    ['r2: the kit lifting the rays at 0.7', 768, weight7],
    ['r2: the kit lifting the rays at 0.5', 768, weight5],
    ['r2: the sky painted out', 768, skyless(head768, headSky)],
    [
      'r3: a 1 px white line at 0.5, at 768',
      768,
      withRay(head768, masterSky768, thin(768, WHITE), 0.5),
    ],
    [
      'r3: a 1 px gold line at 0.5, at 768',
      768,
      withRay(head768, masterSky768, thin(768, GOLD), 0.5),
    ],
    [
      'r3: a 1 px white line at 0.5, at 3072',
      3072,
      withRay(head3072, masterSky3072, thin(3072, WHITE), 0.5),
    ],
    [
      'r3: counsel’s faint white ray',
      768,
      withRay(
        head768,
        masterSky768,
        {
          u: 0.133012,
          v: 0.355084,
          angle: 0.605899,
          halfWidth: 0.0038546,
          reach: 0.653591,
          colour: WHITE,
        },
        0.155737,
      ),
    ],
    [
      'r3: the faint gold ray that passed at growth 0.022',
      768,
      withRay(
        head768,
        masterSky768,
        { u: 0.301, v: 0.14, angle: 0.922, halfWidth: 0.0043, reach: 0.725, colour: GOLD },
        0.127,
      ),
    ],
    ['r3: the kit repainting to 0.95 of its reach, at 1536', 1536, kitStill(kit1536, 0.95, 1)],
    ['r3: the kit at 0.97 of its reach and weight, at 1536', 1536, kitStill(kit1536, 0.97, 0.97)],
    ['r3: head 0.04 toward the old still, at 3072', 3072, mixed(head3072, master, 0.04)],
  ];
  const changes = yield* Effect.forEach(
    lights,
    ([name, width, image]) =>
      Effect.map(
        encoded(stillAt(width), image, { lossless: false, quality: KIT_QUALITY }),
        (bytes) => written(name, stillAt(width), bytes),
      ),
    { concurrency: 8 },
  );
  return [
    written(
      'r1: the old still, rays from the top left, at 768',
      stillAt(768),
      yield* baseStill(768),
    ),
    ...changes,
    written('r1: the old still itself at 3072', stillAt(3072), yield* baseStill(3072)),
  ];
});

const EXTENSIONS = ['webp', 'png', 'jpg', 'jpeg', 'avif', 'gif', 'svg', 'ico'] as const;

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';

const nameFrom = (next: () => number) => {
  const tail = `${LETTERS}0123456789-`;
  const length = Math.floor(next() * 12);
  return (
    (LETTERS[Math.floor(next() * LETTERS.length)] ?? 'a') +
    Array.from({ length }, () => tail[Math.floor(next() * tail.length)] ?? 'a').join('')
  );
};

const imageFrom = (next: () => number) => {
  const extension = EXTENSIONS[Math.floor(next() * EXTENSIONS.length)] ?? 'webp';
  const spelt = Array.from(extension, (c) => [c, c.toUpperCase()][Number(next() < 0.3)]).join('');
  return `${nameFrom(next)}.${spelt}`;
};

const pick = <A>(items: readonly [A, ...ReadonlyArray<A>], next: () => number): A =>
  items[Math.floor(next() * items.length)] ?? items[0];

const SCRIPT_FORMS: ReadonlyArray<(specifier: string, id: string) => string> = [
  (s, id) => `import ${id} from '${s}';`,
  (s) => `import '${s}';`,
  (s, id) => `export { default as ${id} } from '${s}';`,
  (s, id) => `export const ${id} = () => import('${s}');`,
  (s, id) => `import ${id} from '${s}?url';`,
  (s, id) => `export const ${id} = new URL('${s}', import.meta.url);`,
];

const STYLE_FORMS: ReadonlyArray<(specifier: string, id: string) => string> = [
  (s, id) => `.${id} { background: url(${s}); }`,
  (s, id) => `.${id} { background-image: url("${s}"); }`,
  (s, id) => `@media (min-width: 1px) { .${id} { mask: url('${s}#a') no-repeat; } }`,
];

const addedImage = Effect.fn('FieldStill.addedImage')(function* (
  n: number,
  modules: readonly [string, ...ReadonlyArray<string>],
  bytes: Uint8Array,
  next: () => number,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const image = imageFrom(next);
  if (next() < 0.5) {
    const folder = pick(
      [
        'public',
        'public/og',
        'src',
        'src/art',
        'src/motion',
        `public/${nameFrom(next)}`,
        `src/${nameFrom(next)}/${nameFrom(next)}`,
      ],
      next,
    );
    const file = `${folder}/${image}`;
    return [written(`a file ${file}`, file, bytes), file] as const;
  }
  const file = `assets/${image}`;
  const module = pick(modules, next);
  const relative = path.relative(path.dirname(module), file);
  const specifier = `./${relative}`.replace(/^\.\/(?=\.)/, '');
  const forms = [SCRIPT_FORMS, STYLE_FORMS][Number(module.endsWith('.css'))] ?? SCRIPT_FORMS;
  const form = Math.floor(next() * forms.length);
  const line = (forms[form] ?? ((s: string) => s))(specifier, `still${n}`);
  const code = yield* fs.readFileString(`${APP}/${module}`);
  const change: Change = {
    name: `${file} named by ${module} (form ${form}): ${line}`,
    writes: [
      [file, Option.some(bytes)],
      [module, Option.some(new TextEncoder().encode(`${code}\n${line}\n`))],
    ],
  };
  return [change, file] as const;
});

const sourceModules = Effect.fn('FieldStill.sourceModules')(function* () {
  const fs = yield* FileSystem.FileSystem;
  const entries = yield* fs.readDirectory(`${APP}/src`, { recursive: true });
  const modules = entries
    .filter((entry) => /\.(?:ts|tsx|css)$/.test(entry))
    .filter((entry) => !entry.includes('.test.') && !entry.endsWith('.d.ts'))
    .map((entry) => `src/${entry}`)
    .toSorted();
  if (!Arr.isReadonlyArrayNonEmpty(modules))
    return yield* Effect.die(new Error('src/ has no modules'));
  return modules;
});

describe('the images the site serves', () => {
  test('are each a still the record names or an image outside the rule, with why', () =>
    Effect.gen(function* () {
      const { stills } = yield* readRecord(APP);
      const served = yield* servedImages(APP);
      const outside = OUTSIDE.map(({ image }) => image);
      expect(served).toEqual([...Object.keys(stills), ...outside].toSorted());
      expect(outside.filter((image) => Object.hasOwn(stills, image))).toEqual([]);
      expect(OUTSIDE.filter(({ why }) => why.trim() === '')).toEqual([]);
      expect(served.filter((image) => !IMAGE.test(image))).toEqual([]);
    }));

  test('refuse an image added under any served folder or named from any module, until the record names it', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const root = yield* scratchApp(APP);
      const modules = yield* sourceModules();
      const bytes = yield* fs.readFile(`${APP}/${stillAt(768)}`);
      const next = draws(41);
      const added = yield* Effect.forEach(
        Array.from({ length: 48 }, (_, n) => n),
        (n) => addedImage(n, modules, bytes, next),
      );
      const found = yield* foundAfter(
        root,
        added.map(([change]) => change),
      );
      expect(found).toEqual(
        added.map(([change, file]) => [change.name, [{ still: file, why: 'not in the record' }]]),
      );
      expect(new Set(added.map(([change]) => change.writes.length))).toEqual(new Set([1, 2]));
    }).pipe(Effect.scoped));

  test('refuse a new layer the shader imports and a still served from public/, by any name', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const root = yield* scratchApp(APP);
      const still = yield* fs.readFile(`${APP}/${stillAt(768)}`);
      const scene = yield* fs.readFileString(`${APP}/src/motion/scene.ts`);
      const found = yield* foundAfter(root, [
        {
          name: 'src/art/sky-768.webp, imported by src/motion/scene.ts',
          writes: [
            ['src/art/sky-768.webp', Option.some(still)],
            [
              'src/motion/scene.ts',
              Option.some(
                new TextEncoder().encode(`import skyLayer from '../art/sky-768.webp';\n${scene}`),
              ),
            ],
          ],
        },
        written(
          'public/field-hero.webp',
          'public/field-hero.webp',
          yield* fs.readFile(`${APP}/${stillAt(1536)}`),
        ),
        {
          name: 'a type-only import serves nothing',
          writes: [
            [
              'src/motion/scene.ts',
              Option.some(
                new TextEncoder().encode(
                  `import type Sky from '../../kit/art/field.webp';\n${scene}`,
                ),
              ),
            ],
          ],
        },
      ]);
      expect(found).toEqual([
        [
          'src/art/sky-768.webp, imported by src/motion/scene.ts',
          [{ still: 'src/art/sky-768.webp', why: 'not in the record' }],
        ],
        ['public/field-hero.webp', [{ still: 'public/field-hero.webp', why: 'not in the record' }]],
        ['a type-only import serves nothing', []],
      ]);
    }).pipe(Effect.scoped));
});

describe('the field stills the page serves', () => {
  test('are one at each width the srcset names', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const names = yield* fs.readDirectory(`${APP}/src/art`);
      expect(names.filter((name) => /^field-\d+\.webp$/.test(name)).toSorted()).toEqual(
        WIDTHS.map((width) => `field-${width}.webp`).toSorted(),
      );
    }));

  test('are each the still the owner approved, byte for byte, under the ask that showed him them', () =>
    Effect.gen(function* () {
      const { approval } = yield* readRecord(APP);
      expect(approval.ask).toMatch(/^[0-9a-f]{11}$/);
      expect(yield* unapproved(APP)).toEqual([]);
    }));

  test('refuse any change to a served still until the owner approves it', () =>
    Effect.gen(function* () {
      const root = yield* scratchApp(APP);
      const stills = yield* servedStills(APP);
      const next = draws(28);
      const each = yield* Effect.forEach(
        stills,
        (still) =>
          changesOf(
            still,
            stills.filter((other) => other !== still),
            draws(Math.floor(next() * 2 ** 32)),
          ),
        { concurrency: 8 },
      );
      const found = yield* foundAfter(
        root,
        each.flatMap(({ changes }) => changes),
      );
      expect(found.length).toBe(stills.length * 7);
      expect(refusedEach(found)).toEqual(found.map(([name]) => [name, 1] as const));
      expect(found.map(([name, problems]) => [name, problems[0]?.still])).toEqual(
        found.map(([name]) => [name, name.slice(0, name.indexOf(':'))]),
      );
      expect(each.map(({ moved }) => moved)).toEqual(each.map(({ moved: [name] }) => [name, true]));
    }).pipe(Effect.scoped));

  test('refuse a still the record does not name, and a record entry with no file', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const root = yield* scratchApp(APP);
      const card = yield* fs.readFile(`${APP}/public/og/home.jpg`);
      const still = yield* fs.readFile(`${APP}/${stillAt(768)}`);
      const record = yield* fs.readFileString(`${APP}/${RECORD}`);
      const named = record.replace(
        '\n  "stills": {',
        '\n  "stills": {\n    "src/art/field-2048.webp": "0000000000000000000000000000000000000000000000000000000000000000",',
      );
      const found = yield* foundAfter(root, [
        written('a size the srcset does not name', 'src/art/field-1024.webp', still),
        written('a link card the record does not name', 'public/og/about.jpg', card),
        written('a record entry with no file', RECORD, new TextEncoder().encode(named)),
      ]);
      expect(found).toEqual([
        [
          'a size the srcset does not name',
          [{ still: 'src/art/field-1024.webp', why: 'not in the record' }],
        ],
        [
          'a link card the record does not name',
          [{ still: 'public/og/about.jpg', why: 'not in the record' }],
        ],
        ['a record entry with no file', [{ still: 'src/art/field-2048.webp', why: 'no file' }]],
      ]);
    }).pipe(Effect.scoped));

  test('refuse every light the earlier light guards let through', () =>
    Effect.gen(function* () {
      const root = yield* scratchApp(APP);
      const found = yield* foundAfter(root, yield* earlierLights());
      expect(found.length).toBe(19);
      expect(found.map(([name, problems]) => [name, problems.map(({ why }) => why)])).toEqual(
        found.map(([name]) => [name, ['changed']]),
      );
    }).pipe(Effect.scoped));
});
