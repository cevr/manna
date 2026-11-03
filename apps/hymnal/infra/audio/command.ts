import { Command, Flag } from 'effect/cli';

export const audioCopyCommand = Command.make('audio-copy', {
  dryRun: Flag.Boolean('dry-run').pipe(
    Flag.withDefault(false),
    Flag.withDescription('Read the sources and print what would move; never touch R2'),
  ),
}).pipe(Command.withDescription('Copy the hymn recordings from S3 into the R2 bucket cvr-hymns'));

export const audioUploadCommand = Command.make('audio-upload', {
  set: Flag.String('set').pipe(
    Flag.withDescription('The rendered set folder, holding manifest.json and <n>.mp3'),
  ),
  dryRun: Flag.Boolean('dry-run').pipe(
    Flag.withDefault(false),
    Flag.withDescription('Read and check the set and print what would move; never touch R2'),
  ),
}).pipe(
  Command.withDescription('Upload a rendered set of hymn recordings into the R2 bucket cvr-hymns'),
);
