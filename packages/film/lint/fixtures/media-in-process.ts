// Fixture for film/media-in-process: each line marked RED fires the rule, and
// nothing else does.

declare const spawn: (command: string, args: ReadonlyArray<string>) => void;
declare const make: (line: string) => void;
declare const run: (argv: ReadonlyArray<string>) => void;
declare const input: string;
declare const args: ReadonlyArray<string>;

export const bare = () => spawn('ffmpeg', ['-i', input]); // RED film/media-in-process
export const line = () => make('ffmpeg -i in.mp4 out.webm'); // RED film/media-in-process
export const path = () => run(['/usr/bin/ffprobe', input]); // RED film/media-in-process
export const built = `ffmpeg -y ${args.join(' ')}`; // RED film/media-in-process
export const held = `${input} | ffprobe -`; // RED film/media-in-process

// A comment may name the tool: spawn('ffmpeg', …) is refused.
// A name that holds the word inside another, and a regular expression, are not strings naming it.
export const error = 'FFmpegError';
export const library = 'ffmpegLibs';
export const pattern = /\bffmpeg\b/u;
export const other = 'mediabunny';
