import { Effect, Schema } from 'effect';

import * as ChordPro from '../src/chordpro.js';
import { Hymn } from '../src/hymn.js';

const usage =
  'usage: bun run golden <compiled.json> <chart.chordpro> [--level full|guitar|both] [--allow <file>]';

const args = process.argv.slice(2);
const flag = (name: string) => {
  const at = args.indexOf(name);
  if (at < 0) return undefined;
  const value = args[at + 1];
  args.splice(at, 2);
  return value;
};
const level = flag('--level') ?? 'both';
const allowFile = flag('--allow');
const [compiledFile, chartFile] = args;
if (
  compiledFile === undefined ||
  chartFile === undefined ||
  !['full', 'guitar', 'both'].includes(level)
) {
  console.error(usage);
  process.exit(2);
}
const levels = level === 'both' ? (['full', 'guitar'] as const) : [level as 'full' | 'guitar'];

const letters = (text: string) => text.toLowerCase().replace(/[^a-z]/g, '');

const program = Effect.gen(function* () {
  const hymn = yield* Schema.decodeEffect(Schema.fromJsonString(Hymn))(
    yield* Effect.promise(() => Bun.file(compiledFile).text()),
  );
  const sections = yield* ChordPro.parse(yield* Effect.promise(() => Bun.file(chartFile).text()));
  const allowed = new Set(
    allowFile === undefined
      ? []
      : (yield* Effect.promise(() => Bun.file(allowFile).text()))
          .split('\n')
          .map((line) => line.trim().split(/\s+/).slice(0, 4).join(' '))
          .filter((key) => key !== ''),
  );
  let failed = false;
  for (const at of levels) {
    let [parts, syllables, diffs, allowances] = [0, 0, 0, 0];
    const report = (
      part: string,
      n: number,
      kind: string,
      text: string,
      chart: string,
      compiled: string,
    ) => {
      const key = `${hymn.number} ${part} ${at} ${n}`;
      const ok = allowed.has(key);
      console.log(
        `${ok ? 'allowed' : 'diff'} ${key} ${kind} "${text}" chart=${chart} compiled=${compiled}`,
      );
      if (ok) allowances += 1;
      else diffs += 1;
    };
    for (const section of sections.filter((s) => s.level === at)) {
      parts += 1;
      const name = String(section.part);
      const part = section.part === 'refrain' ? hymn.refrain?.part : hymn.stanzas[section.part - 1];
      const compiled = part?._tag === 'Sung' ? part.lines.flat() : [];
      const charted = section.lines.flat();
      if (compiled.length !== charted.length) {
        report(name, 0, 'count', '', String(charted.length), String(compiled.length));
        continue;
      }
      charted.forEach((chart, i) => {
        const mine = compiled[i];
        if (mine === undefined) return;
        syllables += 1;
        if (letters(chart.text) !== letters(mine.text)) {
          report(name, i + 1, 'cut', chart.text, chart.text, mine.text);
        }
        const [want, got] = [
          ChordPro.chords(chart),
          ChordPro.chords(ChordPro.chartChords(mine, at, hymn.key)),
        ];
        if (want !== got) report(name, i + 1, 'chord', chart.text, want, got);
      });
    }
    console.log(
      `golden ${hymn.number} ${at} parts=${parts} syllables=${syllables} diffs=${diffs} allowed=${allowances}`,
    );
    failed ||= diffs > 0;
  }
  if (failed) process.exitCode = 1;
});

await Effect.runPromise(program);
