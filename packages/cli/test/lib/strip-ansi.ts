const ANSI_REGEX = new RegExp(
  [
    '\\x1b\\[[0-9;]*[A-Za-z]',
    '\\x1b\\[\\?[0-9;]*[A-Za-z]',
    '\\x1b\\][^\x07]*(?:\x07|\\x1b\\\\)',
    '\\x1b[PX^_][^\x1b]*\\x1b\\\\',
    '\\x1b.',
  ].join('|'),
  'g',
);

export function stripAnsi(text: string): string {
  return text.replace(ANSI_REGEX, '');
}

export function getPlainLines(text: string): string[] {
  return stripAnsi(text).split('\n');
}

export function normalizeWhitespace(text: string): string {
  return text
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n');
}

export function getVisibleText(text: string): string {
  const plain = stripAnsi(text);
  return normalizeWhitespace(plain);
}
