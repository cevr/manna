/**
 * Make the deck's `.key` match its manifest. A deck with no `.key` is built
 * fresh. An existing deck is edited in place: only what changed since the last
 * sync is touched (a painting, a verse, a reference, a note, the title), each
 * slide found by its painting's description (keynote.ts), so the owner's
 * reordering and his own edits elsewhere stay. A beat new to the manifest is inserted after the
 * beat before it; a beat gone from it is left in the deck unless `--prune`.
 * What the deck was last synced to is kept in <deckDir>/built.json.
 *
 *   bun skills/bible/scripts/deck/sync_deck.ts <deckDir> [--prune]
 *   bun skills/bible/scripts/deck/sync_deck.ts <deckDir> --baseline
 *
 * `--baseline` records the manifest as the deck's state and tags each painting
 * of the deck with its slide's description, changing nothing that shows: once,
 * for a deck built before sync existed. It matches paintings by file name in
 * deck order, so a painting reused within the deck is tagged in manifest order.
 */
import { resolve } from 'node:path';
import {
  TITLE_FILE,
  TITLE_TAG,
  buildScript,
  esc,
  fullContents,
  fullFile,
  fullTag,
  panelFile,
  panelTag,
  sizeFor,
  splitContents,
} from './keynote.ts';
import { type Manifest, type Slide, readManifest } from './manifest.ts';

type BuiltSlide = {
  readonly painting: string;
  readonly text: string;
  readonly ref: string;
  readonly note: string;
};
type Built = {
  readonly title: { readonly painting: string; readonly title: string; readonly subtitle: string };
  readonly slides: Readonly<Record<string, BuiltSlide>>;
};

const args = Bun.argv.slice(2);
const deckArg = args.find((arg) => !arg.startsWith('--'));
if (deckArg === undefined) throw new Error('usage: sync_deck.ts <deckDir> [--prune | --baseline]');
const deckDir = resolve(deckArg);
const manifest = await readManifest(deckDir);
const deckPath = resolve(deckDir, `${manifest.deckName}.key`);
const builtPath = resolve(deckDir, 'built.json');

const prepare = Bun.spawnSync(['bun', resolve(import.meta.dir, 'prepare_images.ts'), deckDir], {
  stdout: 'inherit',
  stderr: 'inherit',
});
if (prepare.exitCode !== 0) throw new Error('prepare_images.ts failed');

const hash = async (file: string) =>
  new Bun.CryptoHasher('sha256')
    .update(await Bun.file(resolve(deckDir, 'images', file)).arrayBuffer())
    .digest('hex');

const stateOf = async (m: Manifest): Promise<Built> => ({
  title: { painting: await hash('title.png'), title: m.title, subtitle: m.subtitle },
  slides: Object.fromEntries(
    await Promise.all(
      m.slides.map(
        async (slide) =>
          [
            slide.id,
            {
              painting: await hash(`${slide.id}.png`),
              text: slide.text,
              ref: slide.ref,
              note: slide.note,
            },
          ] as const,
      ),
    ),
  ),
});

const run = async (script: string, name: string) => {
  const path = resolve(deckDir, name);
  await Bun.write(path, script);
  const result = Bun.spawnSync(['osascript', path], { stderr: 'inherit' });
  if (result.exitCode !== 0) throw new Error(`${name} failed; built.json left as it was`);
  return result.stdout.toString().trim();
};

const now = await stateOf(manifest);
const record = (state: Built) => Bun.write(builtPath, `${JSON.stringify(state, null, 2)}\n`);

if (!(await Bun.file(deckPath).exists())) {
  console.log(await run(buildScript(manifest, deckDir, deckPath), 'build-deck.applescript'));
  await record(now);
  process.exit(0);
}

const app = esc(manifest.app);

/** Handlers: each finds its slide by a painting's description (its tag) and returns a warning, or "". */
const handlers = `
on slideIndex(theDoc, tag)
  tell application "${app}"
    repeat with i from 1 to count of slides of theDoc
      if (count of (images of slide i of theDoc whose description is tag)) > 0 then return i
    end repeat
  end tell
  return 0
end slideIndex

on swapImage(theDoc, tag, posixPath)
  set i to my slideIndex(theDoc, tag)
  if i is 0 then return "no slide shows " & tag & linefeed
  tell application "${app}"
    tell slide i of theDoc
      set im to first image whose description is tag
      set p to position of im
      set w to width of im
      set h to height of im
      delete im
      make new image with properties {file:(POSIX file posixPath), description:tag, position:p, width:w, height:h}
    end tell
  end tell
  return ""
end swapImage

on tagImage(theDoc, fileName, tag)
  tell application "${app}"
    repeat with i from 1 to count of slides of theDoc
      repeat with j from 1 to count of images of slide i of theDoc
        set im to image j of slide i of theDoc
        if file name of im is fileName and description of im does not start with "deck:" then
          set description of im to tag
          return ""
        end if
      end repeat
    end repeat
  end tell
  return "no untagged painting " & fileName & " for " & tag & linefeed
end tagImage

on swapText(theDoc, tag, oldText, newText, newSize)
  set i to my slideIndex(theDoc, tag)
  if i is 0 then return "no slide shows " & tag & linefeed
  tell application "${app}"
    tell slide i of theDoc
      if (count of (text items whose object text is oldText)) is 0 then return "kept the deck's own words on the slide of " & tag & " (changed in Keynote): " & newText & linefeed
      set t to first text item whose object text is oldText
      set object text of t to newText
      if newSize > 0 then set the size of the object text of t to newSize
    end tell
  end tell
  return ""
end swapText

on recenter(theDoc, tag, verseText, refText)
  set i to my slideIndex(theDoc, tag)
  if i is 0 then return ""
  tell application "${app}"
    tell slide i of theDoc
      if (count of (text items whose object text is verseText)) is 0 then return ""
      if (count of (text items whose object text is refText)) is 0 then return ""
      set v to first text item whose object text is verseText
      set r to first text item whose object text is refText
      set x to item 1 of (get position of v)
      set vh to height of v
      set vy to (1080 - vh - 95) div 2
      set position of v to {x, vy}
      set position of r to {x, vy + vh + 40}
    end tell
  end tell
  return ""
end recenter

on swapNote(theDoc, tag, oldNote, newNote)
  set i to my slideIndex(theDoc, tag)
  if i is 0 then return "no slide shows " & tag & linefeed
  tell application "${app}"
    if (presenter notes of slide i of theDoc as text) is not oldNote then return "kept the deck's own note on the slide of " & tag & " (changed in Keynote)" & linefeed
    set presenter notes of slide i of theDoc to newNote
  end tell
  return ""
end swapNote

on removeSlide(theDoc, tag)
  set i to my slideIndex(theDoc, tag)
  if i is 0 then return ""
  tell application "${app}" to delete slide i of theDoc
  return ""
end removeSlide
`;

const q = (value: string) => `"${esc(value)}"`;
const imagePath = (file: string) => q(resolve(deckDir, 'images', file));
const steps: Array<string> = [];
const done: Array<string> = [];
const step = (call: string) => steps.push(`set report to report & ${call}`);

/** The deck opened, `steps` run on it, saved; the script returns the report. */
const docScript = () =>
  [
    handlers,
    `set rootPath to ${q(deckDir)}`,
    `set report to ""`,
    `tell application "${app}"`,
    `  activate`,
    `  set theDoc to open POSIX file ${q(deckPath)}`,
    `end tell`,
    ...steps,
    `tell application "${app}" to save theDoc`,
    `return report`,
    '',
  ].join('\n');

if (args.includes('--baseline')) {
  // Keynote names a painting by the first file of the same bytes it took in, so
  // a painting reused within the deck is looked for under that first name.
  const shownAs = new Map<string, string>();
  const shown = async (file: string) => {
    const bytes = await hash(file);
    const first = shownAs.get(bytes) ?? file;
    shownAs.set(bytes, first);
    return first;
  };
  step(`my tagImage(theDoc, ${q(await shown(TITLE_FILE))}, ${q(TITLE_TAG)})`);
  for (const slide of manifest.slides) {
    step(`my tagImage(theDoc, ${q(await shown(fullFile(slide.id)))}, ${q(fullTag(slide.id))})`);
    step(`my tagImage(theDoc, ${q(await shown(panelFile(slide.id)))}, ${q(panelTag(slide.id))})`);
  }
  const report = await run(docScript(), 'sync-deck.applescript');
  if (report.length > 0) {
    console.log(report);
    throw new Error('some paintings were not tagged; built.json not written');
  }
  await record(now);
  console.log(
    `Tagged the deck's paintings and recorded ${manifest.slides.length} beats as its state`,
  );
  process.exit(0);
}

const builtFile = Bun.file(builtPath);
if (!(await builtFile.exists()))
  throw new Error(
    `${deckPath} exists but built.json does not: run with --baseline once if the deck matches the manifest, or move the deck aside to build it fresh`,
  );
const built: Built = await builtFile.json();

if (now.title.painting !== built.title.painting) {
  step(`my swapImage(theDoc, ${q(TITLE_TAG)}, ${imagePath(TITLE_FILE)})`);
  done.push('title painting');
}
if (now.title.title !== built.title.title) {
  step(`my swapText(theDoc, ${q(TITLE_TAG)}, ${q(built.title.title)}, ${q(now.title.title)}, 0)`);
  done.push('title');
}
if (now.title.subtitle !== built.title.subtitle) {
  step(
    `my swapText(theDoc, ${q(TITLE_TAG)}, ${q(built.title.subtitle)}, ${q(now.title.subtitle)}, 0)`,
  );
  done.push('subtitle');
}

/** Insert a beat's two slides after the slide whose painting is tagged `anchor` (or at the end). */
const insert = (slide: Slide, anchor: string) => {
  steps.push(
    `set k to my slideIndex(theDoc, ${q(anchor)})`,
    `tell application "${app}"`,
    `  tell theDoc`,
    `    if k is 0 then set k to count of slides`,
    `    set fb to make new slide at end with properties {base slide:master slide "Blank"}`,
    `    tell fb`,
    ...fullContents(slide),
    `    end tell`,
    `    move slide (count of slides) to after slide k`,
    `    set sp to make new slide at end with properties {base slide:master slide "Blank"}`,
    `    tell sp`,
    ...splitContents(slide),
    `    end tell`,
    `    move slide (count of slides) to after slide (k + 1)`,
    `  end tell`,
    `end tell`,
  );
};

let anchor = TITLE_TAG;
for (const slide of manifest.slides) {
  const before = built.slides[slide.id];
  const after = now.slides[slide.id];
  if (before === undefined || after === undefined) {
    insert(slide, anchor);
    done.push(`${slide.id} inserted`);
  } else {
    const changed: Array<string> = [];
    if (after.painting !== before.painting) {
      step(`my swapImage(theDoc, ${q(fullTag(slide.id))}, ${imagePath(fullFile(slide.id))})`);
      step(`my swapImage(theDoc, ${q(panelTag(slide.id))}, ${imagePath(panelFile(slide.id))})`);
      changed.push('painting');
    }
    if (after.text !== before.text) {
      step(
        `my swapText(theDoc, ${q(panelTag(slide.id))}, ${q(before.text)}, ${q(after.text)}, ${sizeFor(after.text)})`,
      );
      changed.push('verse');
    }
    if (after.ref !== before.ref) {
      step(`my swapText(theDoc, ${q(panelTag(slide.id))}, ${q(before.ref)}, ${q(after.ref)}, 0)`);
      changed.push('reference');
    }
    if (after.text !== before.text || after.ref !== before.ref)
      step(`my recenter(theDoc, ${q(panelTag(slide.id))}, ${q(after.text)}, ${q(after.ref)})`);
    if (after.note !== before.note) {
      for (const tag of [fullTag(slide.id), panelTag(slide.id)])
        step(`my swapNote(theDoc, ${q(tag)}, ${q(before.note)}, ${q(after.note)})`);
      changed.push('note');
    }
    if (changed.length > 0) done.push(`${slide.id}: ${changed.join(', ')}`);
  }
  anchor = panelTag(slide.id);
}

const gone = Object.keys(built.slides).filter((id) => now.slides[id] === undefined);
const prune = args.includes('--prune');
for (const id of gone) {
  if (prune) {
    step(`my removeSlide(theDoc, ${q(fullTag(id))})`);
    step(`my removeSlide(theDoc, ${q(panelTag(id))})`);
    done.push(`${id} removed`);
  } else console.log(`left in the deck (not in the manifest; --prune removes it): ${id}`);
}

if (steps.length === 0) {
  console.log('The deck matches the manifest: nothing to change');
  process.exit(0);
}

const report = await run(docScript(), 'sync-deck.applescript');
// The deck now holds the manifest, but for words the owner changed in Keynote
// (kept, and named in the report); a beat left in the deck stays recorded until pruned.
await record({
  title: now.title,
  slides: Object.fromEntries(
    Object.entries({ ...built.slides, ...now.slides }).filter(
      ([id]) => now.slides[id] !== undefined || !prune,
    ),
  ),
});
console.log(`Synced ${deckPath} in place:\n  ${done.join('\n  ')}`);
if (report.length > 0) console.log(report);
