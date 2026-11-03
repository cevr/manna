import { escapeAppleScriptString } from '../../lib/apple-notes-utils.js';
import { Schema, SchemaGetter } from 'effect';

const JsonString = Schema.Unknown.pipe(
  Schema.encodeTo(Schema.String, {
    decode: SchemaGetter.parseJson(),
    encode: SchemaGetter.stringifyJson(),
  }),
);

const encodeJson = Schema.encodeUnknownSync(JsonString);

export function asText(str: string): string {
  const normalized = str.replace(/\r\n?/g, '\n');
  return normalized
    .split('\n')
    .map((seg) => `"${escapeAppleScriptString(seg)}"`)
    .join(' & linefeed & ');
}

export function jxaStr(value: string): string {
  return encodeJson(value);
}

export function isPathDeck(deck: string): boolean {
  return (
    deck.endsWith('.key') || deck.startsWith('/') || deck.startsWith('~') || deck.includes('/')
  );
}

export function basename(p: string): string {
  return p.split('/').pop() ?? p;
}

export function findDocAS(isPath: boolean, deckResolved: string): string {
  if (isPath) {
    return (
      `\topen POSIX file ${asText(deckResolved)}\n` +
      `\tif (count of (documents whose name is ${asText(basename(deckResolved))})) = 0 then return "ERROR: could not open deck — " & ${asText(deckResolved)}\n` +
      `\tset theDoc to first document whose name is ${asText(basename(deckResolved))}`
    );
  }
  return (
    `\tif (count of (documents whose name contains ${asText(deckResolved)})) = 0 then return "ERROR: deck not open — " & ${asText(deckResolved)}\n` +
    `\tset theDoc to item 1 of (documents whose name contains ${asText(deckResolved)})`
  );
}

export function findSlideByCaptionAS(captionExpr: string, outVar: string): string {
  return (
    `\tset ${outVar} to 0\n` +
    `\trepeat with i from 1 to (count of slides of theDoc)\n` +
    `\t\tset s to slide i of theDoc\n` +
    `\t\tset capText to ""\n` +
    `\t\trepeat with t in (text items of s)\n` +
    `\t\t\tset capText to capText & (object text of t)\n` +
    `\t\tend repeat\n` +
    `\t\tif capText contains ${captionExpr} then\n` +
    `\t\t\tset ${outVar} to i\n` +
    `\t\t\texit repeat\n` +
    `\t\tend if\n` +
    `\tend repeat`
  );
}
