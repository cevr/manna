import { createContext, use } from 'react';
import { Platform, type TextStyle } from 'react-native';

import { defaultReading, type Font, readingStyle, type ReadingStyle } from './reading';

export interface PageText {
  readonly words: TextStyle;
  readonly chords: TextStyle;
  readonly indent: number;
}

const serif = Platform.select({
  ios: 'Georgia',
  android: 'serif',
  default: 'ui-serif, Georgia, serif',
});

const families: Record<Font, TextStyle> = { system: {}, serif: { fontFamily: serif } };

export const pageTextOf = (style: ReadingStyle): PageText => ({
  words: { ...style.words, ...families[style.font] },
  chords: { ...style.chords, ...families[style.font] },
  indent: style.indent,
});

const PageTextContext = createContext<PageText>(pageTextOf(readingStyle(defaultReading, 1)));

export const PageTextProvider = PageTextContext.Provider;

export const usePageText = () => use(PageTextContext);
