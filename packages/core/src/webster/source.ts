import { Parser } from 'htmlparser2';

import source from '../../assets/webster1828-source.json';
import { referenceCorrections } from './corrections.js';

export const WEBSTER_SOURCE = source;
export const WEBSTER_SCHEMA_VERSION = '1';
export const WEBSTER_PROJECTION_VERSION = '1-scan-references';

export const normalizeHeadword = (value: string): string => value.trim().toLowerCase();

/** Source markup is retained separately. Only decoded text reaches readers. */
const definitionText = (html: string): string => {
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

export const sourceDefinition = (headword: string, html: string): string => {
  let text = definitionText(html);
  for (const correction of referenceCorrections) {
    if (normalizeHeadword(headword) === correction.key)
      text = text.replace(correction.from, correction.to);
  }
  return text;
};
