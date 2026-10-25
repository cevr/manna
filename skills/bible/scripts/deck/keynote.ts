/**
 * The AppleScript that draws a deck's slides, shared by a fresh build and an
 * in-place sync: the title slide, and per beat a full-bleed slide and a split
 * slide (panel + verse + reference), presenter note on both. A slide is found
 * again by its painting's description (`deck:<id> full`, `deck:<id> panel`,
 * `deck:title`), so a sync still finds it after the owner reorders the deck;
 * never by its file name, since Keynote keeps one file name for paintings of
 * the same bytes (a painting reused within a deck).
 */
import type { Manifest, Slide } from './manifest.ts';

export const esc = (value: string) =>
  value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\n');

export const sizeFor = (text: string) =>
  text.length <= 180 ? 48 : text.length <= 300 ? 40 : text.length <= 430 ? 34 : 30;

const WHITE = '{65535, 65535, 65535}';
const GRAY = '{39321, 39321, 39321}';

export const fullFile = (id: string) => `${id}-full.png`;
export const panelFile = (id: string) => `${id}-panel.png`;
export const TITLE_FILE = 'title-full.png';

export const fullTag = (id: string) => `deck:${id} full`;
export const panelTag = (id: string) => `deck:${id} panel`;
export const TITLE_TAG = 'deck:title';

const textItem = (
  name: string,
  text: string,
  box: string,
  font: string,
  size: number,
  color: string,
) => [
  `      set ${name} to make new text item with properties {object text:"${esc(text)}", ${box}}`,
  `      set the font of the object text of ${name} to "${font}"`,
  `      set the size of the object text of ${name} to ${size}`,
  `      set the color of the object text of ${name} to ${color}`,
];

const image = (file: string, tag: string, box: string) =>
  `      make new image with properties {file:(POSIX file (rootPath & "/images/${file}")), description:"${esc(tag)}", ${box}}`;

/** The title slide's contents, inside `tell <slide>`. */
export const titleContents = (manifest: Manifest) => [
  image(TITLE_FILE, TITLE_TAG, 'position:{0, 0}, width:1920, height:1080'),
  ...textItem(
    'titleItem',
    manifest.title,
    'position:{140, 820}, width:1640, height:100',
    'Helvetica Neue Light',
    66,
    WHITE,
  ),
  ...textItem(
    'subItem',
    manifest.subtitle,
    'position:{145, 925}, width:1500, height:60',
    'Helvetica Neue',
    30,
    WHITE,
  ),
];

/** A beat's full-bleed slide's contents, inside `tell <slide>`. */
export const fullContents = (slide: Slide) => [
  image(fullFile(slide.id), fullTag(slide.id), 'position:{0, 0}, width:1920, height:1080'),
  `      set presenter notes to "${esc(slide.note)}"`,
];

const textX = (slide: Slide) => (slide.side === 'right' ? 131 : 984);

/** A beat's split slide's contents, inside `tell <slide>`. */
export const splitContents = (slide: Slide) => {
  const x = textX(slide);
  return [
    image(
      panelFile(slide.id),
      panelTag(slide.id),
      `position:{${slide.side === 'right' ? 1037 : 133}, 75}, width:750, height:903`,
    ),
    ...textItem(
      'verseItem',
      slide.text,
      `position:{${x}, 300}, width:805`,
      'Helvetica Neue Light',
      sizeFor(slide.text),
      WHITE,
    ),
    ...textItem(
      'refItem',
      slide.ref,
      `position:{${x}, 700}, width:805, height:55`,
      'Helvetica Neue',
      30,
      GRAY,
    ),
    // Keynote sizes the verse box to its wrapped text: measure it, then center
    // the verse + reference block instead of estimating line counts.
    `      set verseHeight to height of verseItem`,
    `      set verseY to (1080 - verseHeight - 95) div 2`,
    `      set position of verseItem to {${x}, verseY}`,
    `      set position of refItem to {${x}, verseY + verseHeight + 40}`,
    `      set presenter notes to "${esc(slide.note)}"`,
  ];
};

/** The whole script of a fresh build: a new document, every slide, saved at `savePath`. */
export const buildScript = (manifest: Manifest, deckDir: string, savePath: string) => {
  const lines = [
    `set rootPath to "${esc(deckDir)}"`,
    `set savePath to "${esc(savePath)}"`,
    `tell application "${esc(manifest.app)}"`,
    `  activate`,
    `  set theDoc to make new document with properties {document theme:theme "Basic Black", width:1920, height:1080}`,
    // Saved at its path before any slide is drawn: a new document left unsaved
    // is autosaved by Keynote Creator Studio into iCloud under its suggested
    // name, a stray copy each build.
    `  save theDoc in POSIX file savePath`,
    `  tell theDoc`,
    `    set base slide of slide 1 to master slide "Blank"`,
    `    tell slide 1`,
    ...titleContents(manifest),
    `    end tell`,
  ];
  for (const slide of manifest.slides) {
    lines.push(
      `    set fb to make new slide at end with properties {base slide:master slide "Blank"}`,
      `    tell fb`,
      ...fullContents(slide),
      `    end tell`,
      `    set sp to make new slide at end with properties {base slide:master slide "Blank"}`,
      `    tell sp`,
      ...splitContents(slide),
      `    end tell`,
    );
  }
  lines.push(
    `    save theDoc`,
    `  end tell`,
    `  return "Built " & (count of slides of theDoc) & " slides at " & savePath`,
    `end tell`,
  );
  return `${lines.join('\n')}\n`;
};
