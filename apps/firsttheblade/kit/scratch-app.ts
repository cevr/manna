import { Effect, FileSystem, Path } from 'effect';

import { RECORD } from './approval.ts';
import { SERVED_FOLDERS } from './served.ts';

export const scratchApp = Effect.fn('ScratchApp.make')(function* (app: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* fs.makeTempDirectoryScoped({ prefix: 'stills-' });
  yield* Effect.forEach(SERVED_FOLDERS, (folder) =>
    fs.copy(path.join(app, folder), path.join(root, folder)),
  );
  yield* fs.makeDirectory(path.dirname(path.join(root, RECORD)), { recursive: true });
  yield* fs.copyFile(path.join(app, RECORD), path.join(root, RECORD));
  return root;
});
