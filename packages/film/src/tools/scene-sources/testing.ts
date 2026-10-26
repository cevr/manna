// A films folder on disk for the scene tests (`scene-sources.ts`): one film's
// scene sources, with the formatter they are written through.

import { Effect, FileSystem, Path } from 'effect';

/**
 * A film folder on disk for the lab's source tools: `f/scenes/` with a hand
 * scene (a literal timeline and knobs, one computed offset), a drawing the
 * registry renames (`alpha` registered as `beta`) beside a decoy file that
 * exports a `beta` of its own, a scene whose timeline the registry builds in
 * code, and one with nothing to edit. Every file is as oxfmt leaves it, under
 * the repo's `.oxfmtrc.json`, copied to the root, and the root's
 * `node_modules/.bin/oxfmt` is the repo's: the source writer's `bunx oxfmt`
 * runs it, as it does in the repo, never fetching one from the registry
 * (which, in a folder with none, it did on every write, parallel workers
 * racing on its one install). `f/voice.ts` and `f/film.ts` (its rate) let
 * FilmRepo load it. Returns the films folder.
 */
export const sceneFixture = Effect.fn('test.sceneFixture')(function* (root: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const repo = path.join(import.meta.dir, '..', '..', '..', '..', '..');
  const scenes = path.join(root, 'films', 'f', 'scenes');
  yield* fs.makeDirectory(scenes, { recursive: true });
  yield* fs.copyFile(path.join(repo, '.oxfmtrc.json'), path.join(root, '.oxfmtrc.json'));
  const bin = path.join(root, 'node_modules', '.bin');
  yield* fs.makeDirectory(bin, { recursive: true });
  yield* fs.symlink(path.join(repo, 'node_modules', '.bin', 'oxfmt'), path.join(bin, 'oxfmt'));
  const files = {
    'drawing.ts': 'export const drawing = <T>(d: T): T => d;\n',
    '../voice.ts': "export const voice = { voiceId: 'v', model: 'eleven_v3', settings: {} };\n",
    '../film.ts': 'export const fps = 30;\n',
    'hand.ts': `import { drawing } from './drawing.ts';

const GAP = 0.2;

/** Faith is the hand, not the price. */
export const hand_ = drawing({
  enter: { kind: 'pan', dur: 0.8, dir: -1 },
  timeline: {
    /** The tower of merit tips and slides off the palm. */
    topple: { mark: 'earns', offset: 0.1, dur: 1.8 },
    late: { after: 'topple', offset: GAP * 2 },
  },
  knobs: {
    /** Where the palm comes to rest. */
    palm: [960, 800],
  },
  draw: () => {},
});

export { hand_ as hand };
`,
    'a.ts': `import { drawing } from './drawing.ts';

export const alpha = drawing({ timeline: { go: { at: 'start', dur: 1 } }, draw: () => {} });
`,
    'decoy.ts': `import { drawing } from './drawing.ts';

export const beta = drawing({ timeline: { go: { at: 'start', dur: 1 } }, draw: () => {} });
`,
    'index.ts': `import { alpha } from './a.ts';
import { hand } from './hand.ts';

export const scenes = [
  { id: 'hand', say: 'Faith {earns} nothing.', ...hand },
  { id: 'beta', ...alpha },
  { id: 'built', timeline: { x: { at: 'start' } } },
  { id: 'plain' },
];
`,
  };
  for (const [name, source] of Object.entries(files))
    yield* fs.writeFileString(path.join(scenes, name), source);
  return path.join(root, 'films');
});
