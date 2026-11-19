// Records the TypeScript reference parser's answer for generated queries, for
// the port's property ParseIsTheReference (M1):
//   bun parity/parse-record.ts --seed=42 --count=5000
// writes ergo/bible/testdata/parse-<seed>.tsv, one "<query>\t<answer>" per line:
//   single <book> <chapter> <verse> | chapter <book> <chapter>
//   verseRange <book> <chapter> <start> <end> | chapterRange <book> <start> <end>
//   fullBook <book> | search <query as given>
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseBibleQuery } from "../packages/core/src/bible/parse";
import { generator, verseQuery } from "./suites";

const flag = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const seed = Number(flag("seed") ?? 42);
const count = Number(flag("count") ?? 5000);
const g = generator(seed);
// Edge queries the generator rarely draws, one per reference rule:
// JavaScript's toLowerCase of U+0130, "." stopping at \r, \s holding
// U+00A0, chapter 0, and a text that starts with its numbers.
const fixed = [
  "", " ", "john", "John 3:16", "1 john 4:8", "1john 4 : 8", "ps 23", "song", "qqq 1:1", "x",
  "İsaiah 1:1", "İsa 1", "jo\rhn 3:16", "\rjohn 3", "john\u00a03:16", "john\u00a0", "\u00a0ruth",
  "john 3:16 ", "ps 23\u00a0", "john 3 - 5\r",
  "john 0", "john 0:1", "john 0-2", "3", "1:2", "12", "1 2", "1-2", "1 2:3", "2 3",
];
const lines: string[] = [];
const answer = (q: string): string => {
  const p = parseBibleQuery(q);
  switch (p._tag) {
    case "single":
      return `single ${p.ref.book} ${p.ref.chapter} ${p.ref.verse}`;
    case "chapter":
      return `chapter ${p.ref.book} ${p.ref.chapter}`;
    case "verseRange":
      return `verseRange ${p.ref.start.book} ${p.ref.start.chapter} ${p.ref.start.verse} ${p.ref.end.verse}`;
    case "chapterRange":
      return `chapterRange ${p.start.book} ${p.start.chapter} ${p.end.chapter}`;
    case "fullBook":
      return `fullBook ${p.ref.book}`;
    case "search":
      return `search ${p.query}`;
  }
};
for (const q of fixed) lines.push(`${q}\t${answer(q)}`);
for (let i = lines.length; i < count; i++) {
  const q = verseQuery(g);
  if (q.includes("\t") || q.includes("\n")) throw new Error(`query holds a separator: ${q}`);
  lines.push(`${q}\t${answer(q)}`);
}
// Beside the Ergo test that reads it (embedded from ergo/bible/testdata).
const path = join(import.meta.dir, "../ergo/bible/testdata", `parse-${seed}.tsv`);
await writeFile(path, lines.join("\n") + "\n");
console.log(`recorded ${lines.length} parser answers into ${path}`);
