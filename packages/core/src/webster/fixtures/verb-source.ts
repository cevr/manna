/** Test oracle: a verb marker belongs to this entry only after its own bold
 * heading. Apostrophes, punctuation and SPRED are pinned source layouts. */
export const hasOwnVerbMarker = (html: string, headword: string): boolean => {
  const letters = (word: string) => word.toLowerCase().replace(/[^a-z]/gu, '');
  const marker =
    /<b>([^<]*)<\/b>(['’,.\s]*(?:SPRED,\s*)?\s*)(<i>verb\b|<i>v<\/i>\.|v\.|V[TI]\b|(?:the )?second person\b|past tense of the substantive verb\b)/giu;
  for (const match of html.matchAll(marker))
    if (match[1]?.split(',').some((spelling) => letters(spelling) === letters(headword)))
      return true;
  return false;
};
