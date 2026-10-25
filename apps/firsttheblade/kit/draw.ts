/**
 * `bun run kit`: draws the channel's pictures from the brand (lockup D, the
 * bare wheat, Moonlit wheat) in a browser with the site's own fonts.
 *
 * - The YouTube kit, into `kit/out/`: the avatar, the banner and what each
 *   screen shows of it, the watermark, two thumbnails in the house style,
 *   and `channel.md` (what to paste and where).
 * - The Facebook Page's cover, into `kit/out/`, and what a computer and a
 *   phone show of it.
 * - The site's link cards and icons, into `public/`: a card per page
 *   (`og/<page>.jpg`, 1200 × 630), the app icons and `favicon.ico`.
 *
 * The field is the site's own hero, round 5's repaint at 3072 px
 * (`src/art/field-3072.webp`), so the banner and a shared link look like the
 * page they lead to. The wheat is the site's (`src/art/wheat.svg`), the
 * series marks are from `src/art/`, and the thumbnails' paintings are in
 * `kit/art/` at full size. The colours are `src/palette.ts`. No picture has
 * a paper strip or a disc. The link cards are stills of the field the owner
 * approves by name, so each run ends by naming those that differ from his
 * approval (`./approval.ts`); it never writes the record.
 */
import { BunRuntime, BunServices } from '@effect/platform-bun';
import { chromium, type Browser } from '@playwright/test';
import { Data, Effect, FileSystem, Path } from 'effect';

import { SERIES, type Series, type SeriesId } from '../src/content.ts';
import { PALETTE } from '../src/palette.ts';
import { reportAgainstRecord } from './approval.ts';

const KIT = import.meta.dir;
const APP = `${KIT}/..`;
const OUT = `${KIT}/out`;
const PUBLIC = `${APP}/public`;
const WORK = `${OUT}/.html`;
/** The bare wheat, the one shape of the lockup and the icons. */
const WHEAT = `${APP}/src/art/wheat.svg`;

const url = (file: string) => `file://${encodeURI(file)}`;
const kitArt = (name: string) => url(`${KIT}/art/${name}`);
const emblem = (id: SeriesId) => url(`${APP}/src/art/emblem-${id}.svg`);
const font = (face: string) => url(`${APP}/src/fonts/Newsreader-${face}.woff2`);

const htmlPage = (body: string) => `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:Newsreader;font-style:normal;font-weight:200 800;src:url(${font('normal-latin')}) format('woff2')}
@font-face{font-family:Newsreader;font-style:italic;font-weight:200 800;src:url(${font('italic-latin')}) format('woff2')}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Newsreader,serif;-webkit-font-smoothing:antialiased;text-rendering:geometricPrecision;font-synthesis:none}
.wheat svg{display:block;width:auto;height:100%}
</style></head><body>${body}</body></html>`;

/** The bare wheat, `height` px tall, in `color`. */
const wheatOf = (wheat: string, height: number, color: string) =>
  `<span class="wheat" style="display:block;flex:none;height:${height}px;color:${color}">${wheat}</span>`;

/**
 * Lockup D's wordmark: Newsreader 500 in small capitals, which the browser
 * draws from the capitals (Newsreader has none of its own), and “the” in
 * italic 400.
 */
const wordmark = (px: number, ink: string, accent: string) =>
  `<span style="font:500 ${px}px Newsreader;font-variation-settings:'opsz' 72;font-variant-caps:all-small-caps;font-synthesis-small-caps:auto;letter-spacing:.06em;color:${ink};white-space:nowrap;line-height:1">First <i style="font-variant-caps:normal;font-weight:400;letter-spacing:0;color:${accent}">the</i> Blade</span>`;

/** Lockup D by day: the wheat and “the” in the deep wheat, the words in the ink. */
const lockup = (wheat: string, px: number) =>
  `<div style="display:inline-flex;align-items:center;gap:${px * 0.34}px">${wheatOf(wheat, px * 1.6, PALETTE.accent)}${wordmark(px, PALETTE.ink, PALETTE.accent)}</div>`;

/** The field as the site's hero shows it. */
const FIELD = url(`${APP}/src/art/field-3072.webp`);

const field = (position: string) =>
  `<div style="position:absolute;inset:0;background:url(${FIELD}) ${position}/cover"></div>`;

/** The field fading into the paper over its top `share`, as the site's hero does. */
const fadedField = (position: string, share: number) =>
  `<div style="position:absolute;inset:0;background:${PALETTE.paper}"></div><div style="position:absolute;inset:0 0 auto;height:${share * 100}%;background:url(${FIELD}) ${position}/cover;mask-image:linear-gradient(#000 50%,transparent 86%)"></div>`;

const frame = (width: number, height: number, inner: string) =>
  `<div style="position:relative;width:${width}px;height:${height}px;overflow:hidden">${inner}</div>`;

/** The wheat in the wheat on a night square `size` px wide, its corners rounded by `radius`. */
const nightSquare = (wheat: string, size: number, share: number, radius = 0) =>
  frame(
    size,
    size,
    `<div style="position:absolute;inset:0;display:grid;place-items:center;background:${PALETTE.night};border-radius:${radius}px">${wheatOf(wheat, size * share, PALETTE.wheat)}</div>`,
  );

class BrowserError extends Data.TaggedError('BrowserError')<{
  readonly step: string;
  readonly cause: unknown;
}> {}

const step = <A>(name: string, run: () => PromiseLike<A>) =>
  Effect.tryPromise({
    try: () => run(),
    catch: (cause) => new BrowserError({ step: name, cause }),
  });

/** How a picture is written: a PNG on the page's own ground, a transparent PNG, or a JPEG. */
type Format = 'png' | 'transparent' | 'jpeg';

const SHOT = {
  png: { type: 'png', omitBackground: false },
  transparent: { type: 'png', omitBackground: true },
  jpeg: { type: 'jpeg', quality: 88 },
} as const;

interface Size {
  readonly width: number;
  readonly height: number;
}

/** In the page: every face is in. */
const fontsIn = () => document.fonts.status === 'loaded';

const draw = Effect.fn('Kit.draw')(function* (
  browser: Browser,
  html: string,
  out: string,
  size: Size,
  format: Format = 'png',
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const context = yield* Effect.acquireRelease(
    step('context', () => browser.newContext({ viewport: size, deviceScaleFactor: 1 })),
    (opened) => Effect.promise(() => opened.close()),
  );
  const page = yield* step('page', () => context.newPage());
  yield* fs.makeDirectory(WORK, { recursive: true });
  const file = path.join(WORK, `${path.basename(out)}.html`);
  yield* fs.writeFileString(file, htmlPage(html));
  yield* step('goto', () => page.goto(url(file), { waitUntil: 'networkidle' }));
  yield* step('fonts', () => page.waitForFunction(fontsIn));
  const bytes = yield* step('shot', () => page.screenshot(SHOT[format]));
  yield* fs.makeDirectory(path.dirname(out), { recursive: true });
  yield* fs.writeFile(out, bytes);
  yield* Effect.logInfo('kit.drew').pipe(
    Effect.annotateLogs({ file: path.relative(APP, out), bytes: bytes.length }),
  );
  return new Uint8Array(bytes);
}, Effect.scoped);

/** An .ico of PNG images, one directory entry each (a size of 256 is written as 0). */
const ico = (images: ReadonlyArray<{ readonly size: number; readonly png: Uint8Array }>) => {
  const headLength = 6 + 16 * images.length;
  const total = images.reduce((sum, { png }) => sum + png.length, headLength);
  const bytes = new Uint8Array(total);
  const view = new DataView(bytes.buffer);
  view.setUint16(2, 1, true);
  view.setUint16(4, images.length, true);
  let offset = headLength;
  images.forEach(({ size, png }, i) => {
    const at = 6 + 16 * i;
    view.setUint8(at, size % 256);
    view.setUint8(at + 1, size % 256);
    view.setUint16(at + 4, 1, true);
    view.setUint16(at + 6, 32, true);
    view.setUint32(at + 8, png.length, true);
    view.setUint32(at + 12, offset, true);
    bytes.set(png, offset);
    offset += png.length;
  });
  return bytes;
};

// ── The YouTube kit ──────────────────────────────────────────────────────

/** YouTube's banner areas, in its 2560 × 1440 frame. */
const SAFE = { x: 507, y: 508.5, width: 1546, height: 423 } as const;
const DESKTOP = { y: 508.5, height: 423 } as const;

/** The banner: the lockup in the field's morning sky, over the middle every screen shows. */
const banner = (wheat: string) =>
  frame(
    2560,
    1440,
    `${field('50% 0%')}<div style="position:absolute;left:50%;top:720px;transform:translate(-50%,-50%)">${lockup(wheat, 110)}</div>`,
  );

/** What a TV, a computer and a phone show of the banner. */
const cropsBoard = (src: string) => {
  const label = (text: string) =>
    `<div style="font:500 13px Newsreader;letter-spacing:.16em;color:${PALETTE.ink};margin-bottom:6px">${text}</div>`;
  const tv = 600 / 2560;
  const desk = 760 / 2560;
  const phone = 460 / SAFE.width;
  return `<div style="width:1400px;height:400px;padding:20px;background:${PALETTE.band};display:grid;grid-template-columns:600px 1fr;gap:20px;align-items:start">
<div>${label('TV · ALL 2560 × 1440')}<div style="position:relative;width:600px;height:${1440 * tv}px;background:url(${src}) 0 0/600px ${1440 * tv}px"><div style="position:absolute;left:0;right:0;top:${DESKTOP.y * tv}px;height:${DESKTOP.height * tv}px;outline:2px solid ${PALETTE.paper}"></div><div style="position:absolute;left:${SAFE.x * tv}px;width:${SAFE.width * tv}px;top:${SAFE.y * tv}px;height:${SAFE.height * tv}px;outline:2px dashed ${PALETTE.accent}"></div></div></div>
<div style="display:flex;flex-direction:column;gap:14px"><div>${label('DESKTOP · 2560 × 423')}<div style="width:760px;height:${DESKTOP.height * desk}px;background:url(${src}) 0 ${-DESKTOP.y * desk}px/760px ${1440 * desk}px"></div></div>
<div>${label('PHONE AND SAFE AREA · 1546 × 423')}<div style="width:460px;height:${SAFE.height * phone}px;background:url(${src}) ${-SAFE.x * phone}px ${-SAFE.y * phone}px/${2560 * phone}px ${1440 * phone}px"></div></div></div></div>`;
};

/** A thumbnail's film: its painting, where the frame sits on it, and its question in lines at one size. */
interface Thumb {
  readonly art: string;
  readonly position: string;
  readonly lines: ReadonlyArray<string>;
  readonly px: number;
}

/** Two thumbnails in the house style, from Righteousness by Faith. */
const THUMBS: Record<'robe' | 'court', Thumb> = {
  robe: { art: 'robe.webp', position: '50% 70%', lines: ['Guilty,', 'yet righteous?'], px: 72 },
  court: { art: 'court.webp', position: '50% 40%', lines: ['You did it.'], px: 106 },
};

/**
 * A thumbnail: the film's painting, the night drawn in from the left under
 * its question, which stands in the wheat.
 */
const thumb = (film: Thumb) =>
  frame(
    1280,
    720,
    `<div style="position:absolute;inset:0;background:url(${kitArt(film.art)}) ${film.position}/cover"></div><div style="position:absolute;inset:0;background:linear-gradient(90deg in oklab,color-mix(in srgb,${PALETTE.night} 88%,transparent),color-mix(in srgb,${PALETTE.night} 62%,transparent) 36%,transparent 62%)"></div><div style="position:absolute;left:64px;top:50%;transform:translateY(-50%)"><div style="font:500 ${film.px}px/1.04 Newsreader;font-variation-settings:'opsz' 72;letter-spacing:-.015em;color:${PALETTE.wheat}">${film.lines.join('<br>')}</div></div>`,
  );

// ── The Facebook Page ────────────────────────────────────────────────────

/**
 * The cover at twice the phone's 640 × 360: a phone shows all of it, a
 * computer the band 1640 × 624 across its middle. The lockup stands in the
 * field's morning sky at the middle.
 */
const COVER = { width: 1640, height: 924 } as const;
const COVER_DESKTOP = { y: 150, height: 624 } as const;

const cover = (wheat: string) =>
  frame(
    COVER.width,
    COVER.height,
    `${field('50% 0%')}<div style="position:absolute;left:50%;top:${COVER.height / 2}px;transform:translate(-50%,-50%)">${lockup(wheat, 92)}</div>`,
  );

/** What a computer and a phone show of the cover. */
const coverCropsBoard = (src: string) => {
  const label = (text: string) =>
    `<div style="font:500 13px Newsreader;letter-spacing:.16em;color:${PALETTE.ink};margin-bottom:6px">${text}</div>`;
  const desk = 820 / COVER.width;
  const phone = 480 / COVER.width;
  return `<div style="width:1360px;height:340px;padding:20px;background:${PALETTE.band};display:grid;grid-template-columns:820px 480px;gap:20px;align-items:start">
<div>${label('COMPUTER · 1640 × 624')}<div style="width:820px;height:${COVER_DESKTOP.height * desk}px;background:url(${src}) 0 ${-COVER_DESKTOP.y * desk}px/820px ${COVER.height * desk}px"></div></div>
<div>${label('PHONE · ALL 1640 × 924')}<div style="width:480px;height:${COVER.height * phone}px;background:url(${src}) 0 0/480px ${COVER.height * phone}px"></div></div></div>`;
};

// ── The site's link cards and icons ──────────────────────────────────────

const OG = { width: 1200, height: 630 } as const;

/** The home page's card: the field fading into the paper, the lockup on the paper. */
const homeCard = (wheat: string) =>
  frame(
    OG.width,
    OG.height,
    `${fadedField('50% 45%', 0.7)}<div style="position:absolute;left:0;right:0;bottom:72px;display:flex;justify-content:center">${lockup(wheat, 64)}</div>`,
  );

/** A series' card: the field fading into the paper, and on the paper its mark on its tile, its subject and form, its name and the lockup. */
const seriesCard = (wheat: string, series: Series) =>
  frame(
    OG.width,
    OG.height,
    `${fadedField('50% 45%', 0.56)}<div style="position:absolute;left:72px;right:72px;bottom:60px;display:flex;align-items:center;gap:40px"><div style="flex:none;display:grid;place-items:center;width:240px;height:160px;border-radius:16px;background:${PALETTE.band}"><img src="${emblem(series.id)}" width="104" height="104" alt=""></div><div><div style="font:500 22px Newsreader;font-variant-caps:all-small-caps;font-synthesis-small-caps:auto;letter-spacing:.1em;color:${PALETTE.accent};white-space:nowrap">${series.subject} · ${series.form}</div><div style="margin-top:4px;font:500 60px/1.05 Newsreader;font-variation-settings:'opsz' 72;letter-spacing:-.015em;color:${PALETTE.ink};white-space:nowrap">${series.name}</div><div style="margin-top:16px">${lockup(wheat, 24)}</div></div></div>`,
  );

/** A picture the kit draws: what it is drawn from, the file it goes to, its size and its format. */
interface Picture {
  readonly html: string;
  readonly out: string;
  readonly size: Size;
  readonly format: Format;
}

/**
 * Every picture a viewer or a reader sees, in the order the kit draws them,
 * from the wheat's markup: the channel's avatar, watermark, banner and
 * thumbnails, the Page's cover, and the site's link cards and icons. The
 * email list's promise check reads the words drawn on each
 * (`../scripts/promise.ts`).
 */
export const seen = (wheat: string): ReadonlyArray<Picture> => [
  // The avatar: the bare wheat on the night; YouTube's circle crop leaves it whole.
  {
    html: nightSquare(wheat, 800, 0.58),
    out: `${OUT}/avatar-800.png`,
    size: { width: 800, height: 800 },
    format: 'png',
  },
  // The watermark: the bare wheat with nothing behind it (owner, decisions.log line 69).
  {
    html: frame(
      150,
      150,
      `<div style="display:grid;place-items:center;height:100%">${wheatOf(wheat, 138, PALETTE.wheat)}</div>`,
    ),
    out: `${OUT}/watermark-150.png`,
    size: { width: 150, height: 150 },
    format: 'transparent',
  },
  {
    html: banner(wheat),
    out: `${OUT}/banner-2560x1440.png`,
    size: { width: 2560, height: 1440 },
    format: 'png',
  },
  ...Object.entries(THUMBS).map(([name, film]): Picture => ({
    html: thumb(film),
    out: `${OUT}/thumb-${name}.png`,
    size: { width: 1280, height: 720 },
    format: 'png',
  })),
  { html: cover(wheat), out: `${OUT}/facebook-cover-1640x924.png`, size: COVER, format: 'png' },
  { html: homeCard(wheat), out: `${PUBLIC}/og/home.jpg`, size: OG, format: 'jpeg' },
  ...SERIES.map((series): Picture => ({
    html: seriesCard(wheat, series),
    out: `${PUBLIC}/og/${series.id}.jpg`,
    size: OG,
    format: 'jpeg',
  })),
  // The manifest's icons and the touch icon are the wheat on a night square; each launcher rounds it as it does.
  ...(
    [
      ['icon-512.png', 512],
      ['icon-192.png', 192],
      ['apple-touch-icon.png', 180],
    ] as const
  ).map(([file, size]): Picture => ({
    html: nightSquare(wheat, size, 0.62),
    out: `${PUBLIC}/${file}`,
    size: { width: size, height: size },
    format: 'png',
  })),
];

/** The pictures, from the wheat as the site serves it. */
export const kitPictures = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  return seen(yield* fs.readFileString(WHEAT));
});

const kit = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const wheat = yield* fs.readFileString(WHEAT);
  const browser = yield* Effect.acquireRelease(
    step('launch', () => chromium.launch({ channel: 'chrome' })),
    (opened) => Effect.promise(() => opened.close()),
  );

  yield* Effect.forEach(seen(wheat), (picture) =>
    draw(browser, picture.html, picture.out, picture.size, picture.format),
  );
  yield* fs.copyFile(`${KIT}/channel.md`, `${OUT}/channel.md`);

  // The boards of what each screen shows, for the owner, drawn from the pictures above.
  yield* draw(browser, cropsBoard(url(`${OUT}/banner-2560x1440.png`)), `${OUT}/banner-crops.png`, {
    width: 1400,
    height: 400,
  });
  yield* draw(
    browser,
    coverCropsBoard(url(`${OUT}/facebook-cover-1640x924.png`)),
    `${OUT}/facebook-cover-crops.png`,
    { width: 1360, height: 340 },
  );

  // The favicon is the wheat on a night square with rounded corners, so it reads at 16 px in a light tab strip and a dark one.
  const icons = [];
  for (const size of [16, 32, 48]) {
    const png = yield* draw(
      browser,
      nightSquare(wheat, size, 0.8, size * 0.22),
      `${WORK}/favicon-${size}.png`,
      { width: size, height: size },
      'transparent',
    );
    icons.push({ size, png });
  }
  const favicon = ico(icons);
  yield* fs.writeFile(`${PUBLIC}/favicon.ico`, favicon);
  yield* Effect.logInfo('kit.drew').pipe(
    Effect.annotateLogs({ file: 'public/favicon.ico', sizes: '16,32,48', bytes: favicon.length }),
  );
  yield* reportAgainstRecord(APP);
}).pipe(Effect.scoped);

if (import.meta.main) {
  kit.pipe(Effect.provide(BunServices.layer), BunRuntime.runMain);
}
