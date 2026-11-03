import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { CANVAS, LAYOUTS, type Character } from './series.ts';

export type Beat = {
  readonly ref: string;
  readonly lookupRefs?: ReadonlyArray<string>;
  readonly section: string;
  readonly note: string;
  readonly sourceImage?: string;
  readonly concept?: string;
  readonly character?: Character;
  readonly poseRef?: string;
};

export type DeckSpec = {
  readonly title: string;
  readonly subtitle: string;
  readonly deckName: string;
  readonly titleConcept: string;
  readonly app?: string;
  readonly beats: ReadonlyArray<Beat>;
};

export type Slide = {
  readonly id: string;
  readonly ref: string;
  readonly section: string;
  readonly text: string;
  readonly sourceImage: string;
  readonly concept?: string;
  readonly character?: Character;
  readonly poseRef?: string;
  readonly side: 'left' | 'right';
  readonly note: string;
};

export type Manifest = Omit<DeckSpec, 'beats' | 'app'> & {
  readonly app: string;
  readonly canvas: typeof CANVAS;
  readonly layouts: typeof LAYOUTS;
  readonly slides: ReadonlyArray<Slide>;
};

const clean = (text: string) =>
  text
    .replace(/[[\]¶‹›]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
const slug = (ref: string) =>
  ref
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const verseText = (lookupRef: string) => {
  const result = Bun.spawnSync(['bible', 'verse', lookupRef, '--json'], { stderr: 'inherit' });
  if (result.exitCode !== 0) throw new Error(`Verse lookup failed: ${lookupRef}`);
  const payload = JSON.parse(result.stdout.toString()) as {
    verses: ReadonlyArray<{ text: string }>;
  };
  if (payload.verses.length === 0) throw new Error(`No verses returned: ${lookupRef}`);
  return clean(payload.verses.map((verse) => verse.text).join(' '));
};

export const readManifest = async (deckDir: string) =>
  (await Bun.file(resolve(deckDir, 'manifest.json')).json()) as Manifest;

export const writeManifest = async (deckDir: string, spec: DeckSpec) => {
  const slides = spec.beats.map((beat, index): Slide => {
    if ((beat.sourceImage === undefined) === (beat.concept === undefined))
      throw new Error(`Beat needs exactly one of sourceImage / concept: ${beat.ref}`);
    const id = `s${String(index + 1).padStart(2, '0')}-${slug(beat.ref)}`;
    return {
      id,
      ref: beat.ref,
      section: beat.section,
      text: (beat.lookupRefs ?? [beat.ref]).map(verseText).join(' ... '),
      sourceImage: beat.sourceImage ?? `images/${id}.png`,
      concept: beat.concept,
      character: beat.character,
      poseRef: beat.poseRef,
      side: index % 2 === 0 ? 'right' : 'left',
      note: beat.note,
    };
  });

  const { beats: _beats, ...head } = spec;
  const manifest: Manifest = {
    ...head,
    app: spec.app ?? 'Keynote Creator Studio',
    canvas: CANVAS,
    layouts: LAYOUTS,
    slides,
  };
  await mkdir(resolve(deckDir, 'images'), { recursive: true });
  await Bun.write(resolve(deckDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  const fresh = slides.filter((slide) => slide.concept !== undefined).length;
  console.log(
    `Wrote ${slides.length} beats (${fresh} new paintings, ${slides.length - fresh} reused) → ${1 + slides.length * 2} slides`,
  );
};
