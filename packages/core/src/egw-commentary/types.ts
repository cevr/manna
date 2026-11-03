import type { VerseReference } from '../bible/model.js';

export interface CommentaryEntry {
  readonly refcode: string;
  readonly bookCode: string;
  readonly bookTitle: string;
  readonly bookAuthor: string;
  readonly content: string;
  readonly puborder: number;
}

export interface CommentaryResult {
  readonly verse: VerseReference;
  readonly entries: readonly CommentaryEntry[];
}
