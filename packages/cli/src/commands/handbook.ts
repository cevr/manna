import { Argument, Command, Flag } from 'effect/cli';
import { BunServices } from '@effect/platform-bun';
import { Console, DateTime, Effect, FileSystem, Option, Schema } from 'effect';

import { CliProcess } from '../services/process.js';

const ManifestSection = Schema.Struct({
  file: Schema.String,
  part: Schema.String,
});

const HandbookManifest = Schema.Struct({
  title: Schema.String,
  topic: Schema.optional(Schema.String),
  createdAt: Schema.optional(Schema.String),
  thesis: Schema.String,
  method: Schema.String,
  outPath: Schema.optional(Schema.String),
  sections: Schema.Array(ManifestSection),
});

type HandbookManifest = typeof HandbookManifest.Type;

const decodeHandbookManifest = Schema.decodeUnknownEffect(Schema.fromJsonString(HandbookManifest));

interface ParsedSection {
  readonly title: string;
  readonly body: string;
  readonly definedSymbols: ReadonlyArray<string>;
}

function parseSection(raw: string): Option.Option<ParsedSection> {
  const lines = raw.split('\n');
  const headingIdx = lines.findIndex((l) => /^##\s+\S/.test(l));
  if (headingIdx === -1) {
    return Option.none();
  }

  const headingLine = lines[headingIdx] ?? '';
  const title = headingLine
    .replace(/^##\s+/, '')
    .replace(/^\d+\.\s+/, '')
    .trim();

  const body = lines.slice(headingIdx).join('\n').trim();
  const definedSymbols = extractDefinedSymbols(lines.slice(headingIdx));

  return Option.some({ title, body, definedSymbols });
}

function extractDefinedSymbols(bodyLines: ReadonlyArray<string>): ReadonlyArray<string> {
  const startIdx = bodyLines.findIndex((l) => /\*\*Symbols defined here:\*\*/i.test(l));
  if (startIdx === -1) return [];

  const out: string[] = [];
  for (let i = startIdx + 1; i < bodyLines.length; i++) {
    const line = bodyLines[i] ?? '';
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      if (out.length > 0) break;
      continue;
    }
    if (/^\*\*/.test(trimmed) && !/^- /.test(trimmed)) break;
    if (/^- /.test(trimmed)) {
      out.push(trimmed.replace(/^- /, '').trim());
    } else if (out.length > 0) {
      out[out.length - 1] = `${out[out.length - 1] ?? ''} ${trimmed}`;
    }
  }
  return out;
}

function numberHeading(body: string, n: number, title: string): string {
  const firstNl = body.indexOf('\n');
  let rest = '';
  if (firstNl !== -1) rest = body.slice(firstNl);
  return `## ${n}. ${title}${rest}`;
}

function partHeading(part: string): string {
  if (part.startsWith('Part')) return part;
  return `Part ${part}`;
}

function appendixSortKey(symbolBullet: string): string {
  const m = symbolBullet.match(/\*\*([^*]+)\*\*/);
  const name = (m?.[1] ?? symbolBullet).toLowerCase().trim();
  return name.replace(/^(the|a|an)\s+/, '');
}

function frontmatter(topic: string, createdAt: string): string {
  return ['---', `created_at: '${createdAt}'`, `topic: ${topic}`, '---'].join('\n');
}

function assemble(
  manifest: HandbookManifest,
  sections: ReadonlyArray<{ parsed: ParsedSection; part: string }>,
  defaultCreatedAt: string,
): string {
  const topic = manifest.topic ?? manifest.title;
  const createdAt = manifest.createdAt ?? defaultCreatedAt;

  const partOrder: string[] = [];
  const byPart = new Map<string, Array<{ n: number; title: string; body: string }>>();
  sections.forEach((s, idx) => {
    const n = idx + 1;
    if (!byPart.has(s.part)) {
      byPart.set(s.part, []);
      partOrder.push(s.part);
    }
    byPart.get(s.part)?.push({
      n,
      title: s.parsed.title,
      body: numberHeading(s.parsed.body, n, s.parsed.title),
    });
  });

  const tocLines: string[] = ['## Table of Contents', ''];
  for (const part of partOrder) {
    tocLines.push(`**${partHeading(part)}**`, '');
    for (const sec of byPart.get(part) ?? []) {
      tocLines.push(`${sec.n}. ${sec.title}`);
    }
    tocLines.push('');
  }

  const bodyLines: string[] = [];
  for (const part of partOrder) {
    bodyLines.push(`# ${partHeading(part)}`, '');
    for (const sec of byPart.get(part) ?? []) {
      bodyLines.push(sec.body.trim(), '');
    }
  }

  const appendixEntries: Array<{ key: string; line: string }> = [];
  for (const s of sections) {
    for (const sym of s.parsed.definedSymbols) {
      let punctuation = '.';
      if (/\.\s*$/.test(sym)) punctuation = '';
      const line = `- ${sym}${punctuation} — defined in "${s.parsed.title}".`;
      appendixEntries.push({ key: appendixSortKey(sym), line });
    }
  }
  appendixEntries.sort((a, b) => a.key.localeCompare(b.key));

  const appendixLines: string[] = [
    '## Appendix — Symbol Dictionary',
    '',
    'Every symbol defined in this handbook, alphabetically (leading articles ignored), with its receipts and owning section.',
    '',
    ...appendixEntries.map((e) => e.line),
  ];

  return [
    frontmatter(topic, createdAt),
    '',
    `# ${manifest.title}`,
    '',
    `**Thesis.** ${manifest.thesis}`,
    '',
    `**Method.** ${manifest.method}`,
    '',
    '---',
    '',
    tocLines.join('\n').trim(),
    '',
    '---',
    '',
    bodyLines.join('\n').trim(),
    '',
    '---',
    '',
    appendixLines.join('\n').trim(),
    '',
  ].join('\n');
}

const saveDir = Argument.Directory('dir', { mustExist: true }).pipe(
  Argument.withDescription('Directory containing handbook.json and the per-section .md files'),
);
const saveOut = Flag.String('out').pipe(
  Flag.withAlias('o'),
  Flag.withDescription('Output path (overrides the manifest outPath)'),
  Flag.optional,
);
const saveManifest = Flag.String('manifest').pipe(
  Flag.withDescription('Path to the manifest JSON (default: <dir>/handbook.json)'),
  Flag.optional,
);
const saveDryRun = Flag.Boolean('dry-run').pipe(
  Flag.withDescription('Print the assembled handbook to stdout; write nothing'),
  Flag.withDefault(false),
);

const handbookSave = Command.make(
  'save',
  { dir: saveDir, out: saveOut, manifest: saveManifest, dryRun: saveDryRun },
  (args) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const cliProcess = yield* CliProcess;

      const manifestPath = Option.match(args.manifest, {
        onSome: (m) => m,
        onNone: () => `${args.dir}/handbook.json`,
      });

      const manifestExists = yield* fs.exists(manifestPath);
      if (!manifestExists) {
        yield* Console.error(`No manifest found at ${manifestPath}.`);
        yield* Console.error(
          'Pass --manifest <path>, or drop a handbook.json in the sections dir. Shape:',
        );
        yield* Console.error(
          '  { "title", "thesis", "method", "outPath", "sections": [ { "file", "part" } ] }',
        );
        return yield* cliProcess.exitFailure;
      }

      const manifestRaw = yield* fs.readFileString(manifestPath);
      const manifest = yield* decodeHandbookManifest(manifestRaw).pipe(
        Effect.catch((error) =>
          Effect.gen(function* () {
            yield* Console.error(`Could not parse handbook manifest: ${String(error)}`);
            return yield* cliProcess.exitFailure;
          }),
        ),
      );

      if (!Array.isArray(manifest.sections) || manifest.sections.length === 0) {
        yield* Console.error('Manifest has no sections[].');
        return yield* cliProcess.exitFailure;
      }

      const parsed: Array<{ parsed: ParsedSection; part: string }> = [];
      for (const s of manifest.sections) {
        let path = `${args.dir}/${s.file}`;
        if (s.file.startsWith('/')) path = s.file;
        const exists = yield* fs.exists(path);
        if (!exists) {
          yield* Console.error(`Section file missing: ${path}`);
          return yield* cliProcess.exitFailure;
        }
        const raw = yield* fs.readFileString(path);
        const parsedSection = parseSection(raw);
        if (Option.isNone(parsedSection)) {
          yield* Console.error(`Section "${s.file}" has no "## Title" heading.`);
          return yield* cliProcess.exitFailure;
        }
        parsed.push({ parsed: parsedSection.value, part: s.part });
      }

      const now = yield* DateTime.now;
      const document = assemble(manifest, parsed, DateTime.formatIso(now));

      const symbolCount = parsed.reduce((acc, p) => acc + p.parsed.definedSymbols.length, 0);

      if (args.dryRun) {
        yield* Console.log(document);
        yield* Console.error(
          `\n[dry-run] ${parsed.length} sections, ${symbolCount} symbols — not written.`,
        );
        return;
      }

      const outPath = Option.orElse(args.out, () => Option.fromNullishOr(manifest.outPath));
      if (Option.isNone(outPath)) {
        yield* Console.error('No output path: set "outPath" in the manifest or pass --out.');
        return yield* cliProcess.exitFailure;
      }

      yield* fs.writeFileString(outPath.value, document);
      yield* Console.log(
        `✓ Assembled "${manifest.title}" — ${parsed.length} sections, ${symbolCount} symbols.`,
      );
      yield* Console.log(`  → ${outPath}`);
    }).pipe(Effect.provide(BunServices.layer)),
);

export const handbook = Command.make('handbook', {}, () =>
  Effect.gen(function* () {
    yield* Console.log('Usage: manna handbook save <dir> [--out PATH] [--dry-run]');
    yield* Console.log('');
    yield* Console.log(
      'Assemble a finished handbook from <dir>/handbook.json + its per-section .md files',
    );
    yield* Console.log('in one deterministic call (frontmatter, TOC, Part dividers, renumbered');
    yield* Console.log('sections, and the Symbol Dictionary appendix).');
    yield* Console.log('');
    yield* Console.log('Examples:');
    yield* Console.log('  manna handbook save outputs/studies/why-he-tarries/sections');
    yield* Console.log('  manna handbook save ./sections --out /tmp/draft.md --dry-run');
  }),
).pipe(Command.withSubcommands([handbookSave]));
