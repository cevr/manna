import { Parser } from 'htmlparser2';

import source from '../../assets/webster1828-source.json';

export const WEBSTER_SOURCE = source;
export const WEBSTER_SCHEMA_VERSION = '1';

export const normalizeHeadword = (value: string): string => value.trim().toLowerCase();

/** Source markup is retained separately. Only decoded text reaches readers. */
export const definitionText = (html: string): string => {
  const parts: string[] = [];
  let hidden = 0;
  const blocks = new Set(['p', 'div', 'li', 'br']);
  const parser = new Parser(
    {
      onopentag(name) {
        if (name === 'script' || name === 'style') hidden++;
        if (hidden === 0 && blocks.has(name)) parts.push('\n\n');
      },
      ontext(text) {
        if (hidden === 0) parts.push(text.replace(/\s+/gu, ' '));
      },
      onclosetag(name) {
        if (name === 'script' || name === 'style') hidden--;
        if (hidden === 0 && blocks.has(name)) parts.push('\n\n');
      },
    },
    { decodeEntities: true },
  );
  parser.end(html);
  return parts
    .join('')
    .replace(/ *\n+ */gu, '\n\n')
    .trim();
};
