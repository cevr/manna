import { Option, Predicate } from 'effect';

export type TextSegment =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'italic'; readonly text: string }
  | { readonly type: 'highlight'; readonly text: string }
  | { readonly type: 'redLetter'; readonly text: string }
  | { readonly type: 'redLetterItalic'; readonly text: string }
  | { readonly type: 'redLetterQuote'; readonly text: string }
  | { readonly type: 'margin'; readonly noteIndex: number }
  | {
      readonly type: 'phrase';
      readonly text: string;
      readonly slug: string;
      readonly alias: string;
    };

type TextBearingSegment = Exclude<TextSegment, { readonly type: 'margin' }>;

interface MarginNoteAnchor {
  readonly noteIndex: number;
  readonly phrase: string;
}

export const applyItalicSegments = (segments: readonly TextSegment[]): TextSegment[] => {
  const result: TextSegment[] = [];
  for (const segment of segments) {
    if (segment.type !== 'text' && segment.type !== 'redLetter') {
      result.push(segment);
      continue;
    }
    let italicType: TextSegment['type'] = 'italic';
    if (segment.type === 'redLetter') italicType = 'redLetterItalic';
    const parts = segment.text.split(/(\[[^\]]+\])/);
    for (const part of parts) {
      if (part.startsWith('[') && part.endsWith(']')) {
        result.push({ type: italicType, text: part.slice(1, -1) });
      } else if (part) {
        result.push({ type: segment.type, text: part });
      }
    }
  }
  return result;
};

export const applyRedLetterSegments = (segments: readonly TextSegment[]): TextSegment[] => {
  const result: TextSegment[] = [];
  let inRedLetter = false;

  for (const segment of segments) {
    if (segment.type === 'italic' && inRedLetter) {
      result.push({ type: 'redLetterItalic', text: segment.text });
      continue;
    }
    if (segment.type !== 'text') {
      result.push(segment);
      continue;
    }
    inRedLetter = splitRedLetterRun(segment.text, inRedLetter, result);
  }
  return result;
};

const splitRedLetterRun = (
  text: string,
  startsInRedLetter: boolean,
  result: TextSegment[],
): boolean => {
  let inRedLetter = startsInRedLetter;
  let rest = text;
  while (rest.length > 0) {
    let afterQuote: Option.Option<string>;
    if (inRedLetter) afterQuote = closeRedLetter(rest, result);
    else afterQuote = openRedLetter(rest, result);
    if (Option.isNone(afterQuote)) break;
    inRedLetter = !inRedLetter;
    rest = afterQuote.value;
  }
  return inRedLetter;
};

const closeRedLetter = (text: string, result: TextSegment[]): Option.Option<string> => {
  const closeIdx = text.indexOf('›');
  if (closeIdx === -1) {
    result.push({ type: 'redLetter', text });
    return Option.none();
  }
  if (closeIdx > 0) {
    result.push({ type: 'redLetter', text: text.slice(0, closeIdx) });
  }
  result.push({ type: 'redLetterQuote', text: '”' });
  return Option.some(text.slice(closeIdx + 1));
};

const openRedLetter = (text: string, result: TextSegment[]): Option.Option<string> => {
  const openIdx = text.indexOf('‹');
  if (openIdx === -1) {
    if (text.length > 0) {
      result.push({ type: 'text', text });
    }
    return Option.none();
  }
  if (openIdx > 0) {
    result.push({ type: 'text', text: text.slice(0, openIdx) });
  }
  result.push({ type: 'redLetterQuote', text: '“' });
  return Option.some(text.slice(openIdx + 1));
};

const applyMarginAnchors = (
  segments: readonly TextSegment[],
  marginNotes: readonly MarginNoteAnchor[],
): TextSegment[] => {
  if (marginNotes.length === 0) return segments.slice();

  let whole = '';
  const starts: number[] = [];
  for (const segment of segments) {
    starts.push(whole.length);
    if (segment.type === 'margin') continue;
    whole += segment.text;
  }
  const lowerWhole = whole.toLowerCase();

  const byEnd: { end: number; noteIndex: number }[] = [];
  for (const note of marginNotes) {
    const at = lowerWhole.indexOf(note.phrase.toLowerCase());
    if (at === -1) continue;
    byEnd.push({ end: at + note.phrase.length, noteIndex: note.noteIndex });
  }
  byEnd.sort((left, right) => left.end - right.end);

  const result: TextSegment[] = [];
  let cursor = 0;
  for (const [index, original] of segments.entries()) {
    if (original.type === 'margin') {
      result.push(original);
      continue;
    }
    cursor = splitAtAnchors(original, starts[index] ?? 0, byEnd, result);
  }
  if (cursor < whole.length) result.push({ type: 'text', text: whole.slice(cursor) });
  return result;
};

const splitAtAnchors = (
  segment: TextBearingSegment,
  start: number,
  byEnd: readonly { readonly end: number; readonly noteIndex: number }[],
  result: TextSegment[],
): number => {
  const end = start + segment.text.length;
  let local = 0;
  for (const anchor of byEnd) {
    if (anchor.end <= start || anchor.end > end) continue;
    const offset = anchor.end - start;
    if (offset > local) {
      result.push({ ...segment, text: segment.text.slice(local, offset) });
    }
    result.push({ type: 'margin', noteIndex: anchor.noteIndex });
    local = offset;
  }
  if (local < segment.text.length) {
    result.push({ ...segment, text: segment.text.slice(local) });
  }
  return end;
};

export const applySearchHighlights = (
  segments: readonly TextSegment[],
  searchQuery: string,
): TextSegment[] => {
  if (searchQuery.length < 2) return segments.slice();

  const result: TextSegment[] = [];
  const lowerQuery = searchQuery.toLowerCase();

  for (const segment of segments) {
    if (segment.type !== 'text') {
      result.push(segment);
      continue;
    }

    const segText = segment.text;
    const lowerSegText = segText.toLowerCase();
    let pos = 0;
    let searchPos = lowerSegText.indexOf(lowerQuery, pos);

    while (searchPos !== -1) {
      if (searchPos > pos) {
        result.push({ type: 'text', text: segText.slice(pos, searchPos) });
      }
      result.push({
        type: 'highlight',
        text: segText.slice(searchPos, searchPos + searchQuery.length),
      });
      pos = searchPos + searchQuery.length;
      searchPos = lowerSegText.indexOf(lowerQuery, pos);
    }

    if (pos < segText.length) {
      result.push({ type: 'text', text: segText.slice(pos) });
    }
  }

  return result;
};

interface PhraseSpanInput {
  readonly start: number;
  readonly end: number;
  readonly slug: string;
  readonly alias: string;
}

type SegmentPhraseSpans = readonly (readonly PhraseSpanInput[])[];

export const applyPhraseSegments = (
  segments: readonly TextSegment[],
  spans: SegmentPhraseSpans,
): TextSegment[] => {
  const result: TextSegment[] = [];
  for (const [index, segment] of segments.entries()) {
    const matched = spans[index] ?? [];
    if (segment.type !== 'text' || matched.length === 0) {
      result.push(segment);
      continue;
    }
    let cursor = 0;
    for (const span of matched) {
      if (span.start < cursor || span.end > segment.text.length) continue;
      if (span.start > cursor) {
        result.push({ type: 'text', text: segment.text.slice(cursor, span.start) });
      }
      result.push({
        type: 'phrase',
        text: segment.text.slice(span.start, span.end),
        slug: span.slug,
        alias: span.alias,
      });
      cursor = span.end;
    }
    if (cursor < segment.text.length) {
      result.push({ type: 'text', text: segment.text.slice(cursor) });
    }
  }
  return result;
};

export const segmentVerseText = (
  raw: string,
  marginNotes: readonly MarginNoteAnchor[] = [],
  searchQuery?: string,
): TextSegment[] => composeSegments({ text: raw, marginNotes, searchQuery });

export type SegmentLayer = 'italic' | 'redLetter' | 'margin' | 'phrase';

export const SEGMENT_APPLICATION_ORDER: readonly SegmentLayer[] = [
  'italic',
  'redLetter',
  'margin',
  'phrase',
];

type PhraseLayer = (segments: readonly TextSegment[]) => SegmentPhraseSpans;

const NO_PHRASES: PhraseLayer = () => [];

interface SegmentComposition {
  readonly text: string;
  readonly marginNotes?: readonly MarginNoteAnchor[];
  readonly searchQuery?: string;
  readonly phrases?: PhraseLayer;
}

const composeSegments = (input: SegmentComposition): TextSegment[] => {
  const text = input.text.replace(/^¶\s*/, '');
  let segments: TextSegment[] = [{ type: 'text', text }];
  if (Predicate.isNotUndefined(input.searchQuery) && input.searchQuery.length > 0) {
    segments = applySearchHighlights(segments, input.searchQuery);
  }

  for (const layer of SEGMENT_APPLICATION_ORDER) {
    switch (layer) {
      case 'italic':
        segments = applyItalicSegments(segments);
        break;
      case 'redLetter':
        segments = applyRedLetterSegments(segments);
        break;
      case 'margin':
        segments = applyMarginAnchors(segments, input.marginNotes ?? []);
        break;
      case 'phrase': {
        const phrases = input.phrases ?? NO_PHRASES;
        segments = applyPhraseSegments(segments, phrases(segments));
        break;
      }
    }
  }
  return segments;
};

export const renderVerseSegments = (input: SegmentComposition): TextSegment[] =>
  composeSegments(input);
