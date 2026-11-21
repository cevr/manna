/**
 * The notice the Gemma Terms of Use ask of a work made from a Gemma model
 * (section 3.1), in About's words: `lead`, then a link to the Terms
 * (`terms`, at `termsUrl`), `between`, a link to the Prohibited Use Policy
 * (`policy`, at `policyUrl`) and `end`; and `termsButton`, the button that
 * shows the Terms themselves. Pure data, so the Exact port reads the same
 * words.
 */
export const GEMMA_NOTICE = {
  lead: 'Hymns about this and More like this: a word table and hymn vectors made from EmbeddingGemma by Google, a Gemma model, and modified (cut to 4 and 8 bits). Gemma is provided under and subject to the Gemma Terms of Use found at ',
  terms: 'ai.google.dev/gemma/terms',
  termsUrl: 'https://ai.google.dev/gemma/terms',
  between: '. Their use is subject to the restrictions of the ',
  policy: 'Gemma Prohibited Use Policy',
  policyUrl: 'https://ai.google.dev/gemma/prohibited_use_policy',
  end: '.',
  termsButton: 'Gemma Terms of Use',
} as const;
