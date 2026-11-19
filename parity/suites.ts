// The parity corpus: per suite, sessions of CLI steps. Fixed rows come from
// the callers' contract (the bible skill's `manna verse` forms); generated rows
// come from a seed (a linear congruential generator, so a seed replays the
// same corpus everywhere).
import { join } from "node:path";
import { BIBLE_BOOK_ALIASES, BIBLE_BOOKS } from "../packages/core/src/bible/canon";
import type { Step } from "./process";

// A usage step's help layout is Ergo's own (declared-differences.md): the
// runner compares only its exit status and that stderr is not empty.
export type CaseStep = Step & { usage?: boolean };
export type Session = { name: string; steps: CaseStep[] };
export type Suite = {
  // Store files the suite reads, by env name; their sha256 goes in the header.
  stores: Record<string, string>;
  sessions(seed: number): Session[];
};

export function generator(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
  return { next, pick: <T>(items: readonly T[]): T => items[next() % items.length]! };
}

const aliases = [...BIBLE_BOOK_ALIASES.keys()];
const names = BIBLE_BOOKS.map((b) => b.name);
const chaptersOf = new Map(BIBLE_BOOKS.map((b) => [b.number, b.chapters]));

// One generated query text: a book token in some spelling and a reference
// form, sometimes out of range, sometimes plain words (a search).
export function verseQuery(g: ReturnType<typeof generator>): string {
  const kind = g.next() % 12;
  if (kind === 11) return g.pick(["faith", "love", "grace", "kingdom of heaven", "zzqx", "light"]);
  const bookIndex = g.next() % BIBLE_BOOKS.length;
  const book = BIBLE_BOOKS[bookIndex]!;
  const spellings = [book.name, book.name.toLowerCase(), book.abbreviation, g.pick(aliases), g.pick(names)];
  let token = g.pick(spellings);
  const twist = g.next() % 6;
  if (twist === 0) token = token.toUpperCase();
  else if (twist === 1) token = token + ".";
  else if (twist === 2) token = token.slice(0, Math.max(1, token.length - 1 - (g.next() % 3)));
  else if (twist === 3) token = token.replace(" ", "");
  const chapters = chaptersOf.get(book.number) ?? 1;
  const chapter = g.next() % 5 === 0 ? chapters + 1 : 1 + (g.next() % chapters);
  const verse = 1 + (g.next() % 40);
  const end = verse + (g.next() % 6) - 1;
  const sp = () => g.pick(["", " ", "  "]);
  switch (kind % 6) {
    case 0:
      return `${token} ${chapter}:${verse}`;
    case 1:
      return `${token} ${chapter}${sp()}:${sp()}${verse}${sp()}-${sp()}${end}`;
    case 2:
      return `${token} ${chapter}`;
    case 3:
      return `${token} ${chapter}-${Math.min(chapter + (g.next() % 3), chapters + (g.next() % 2))}`;
    case 4:
      return `${token}${sp()}${chapter}:${verse}`;
    default:
      return token;
  }
}

const step = (...args: string[]): CaseStep => ({ args });
const bibleDb = join(import.meta.dir, "../packages/core/data/bible.db");

const verse: Suite = {
  stores: { BIBLE_DB_PATH: bibleDb },
  sessions(seed) {
    const sessions: Session[] = [
      {
        name: "forms",
        steps: [
          "john 3:16",
          "john 3",
          "john 3:16-18",
          "john 3-5",
          "ruth",
          "1 cor 13:1-5",
          "1cor 13",
          "Gen. 1:1",
          "song 2:1",
          "jude 1:25",
          "john 22",
          "john 3:99",
          "john 3:18-16",
          "daniel 9:24-27",
        ].flatMap((q) => [step("verse", q), step("verse", q, "--json")]),
      },
      {
        name: "words",
        steps: [step("verse", "john", "3:16"), step("verse", "1", "john", "4:8", "--json")],
      },
      {
        name: "search",
        steps: [
          step("verse", "faith"),
          step("verse", "faith", "--json"),
          step("verse", "faith", "--limit", "1"),
          step("verse", "faith", "--limit", "0"),
          step("verse", "kingdom of heaven", "--limit", "3", "--json"),
          step("verse", "zzqx"),
          step("verse", "zzqx", "--json"),
          step("verse", "Melchisedec", "--limit", "100"),
          step("verse", "Melchisedec", "--limit", "9"),
          step("verse", "Melchisedec", "--limit", "10"),
          step("verse", "Melchisedec", "--limit", "11"),
        ],
      },
      { name: "empty", steps: [step("verse"), step("verse", "--json"), step("verse", " ")] },
      {
        name: "usage",
        steps: [["verse", "john", "--limit", "x"], ["verse", "--bad"]].map((args) => ({
          args,
          usage: true,
        })),
      },
    ];
    const g = generator(seed);
    for (let i = 0; i < 8; i++) {
      const steps: CaseStep[] = [];
      for (let j = 0; j < 5; j++) {
        const q = verseQuery(g);
        const json = g.next() % 2 === 0;
        const args = ["verse", q, ...(json ? ["--json"] : [])];
        if (g.next() % 4 === 0) args.push("--limit", String(g.next() % 4));
        steps.push({ args });
      }
      sessions.push({ name: `seed-${seed}-${i}`, steps });
    }
    return sessions;
  },
};

export const suites: Record<string, Suite> = { verse };
