// The TypeScript side of Parse's receipt (M1): parses each recorded query on
// standard input and prints how many name a book, as ergo/cmd/parse-receipt.
//   bun parity/parse-receipt.ts < ergo/bible/testdata/parse-42.tsv
import { parseBibleQuery } from "../packages/core/src/bible/parse";

const text = await Bun.stdin.text();
let found = 0;
for (const line of text.split("\n")) {
  const tab = line.indexOf("\t");
  if (tab < 0) continue;
  if (parseBibleQuery(line.slice(0, tab))._tag !== "search") found++;
}
console.log(found);
