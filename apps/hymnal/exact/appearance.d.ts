/**
 * `src/appearance.ts` (the web's) as Exact's type check reads it: setting
 * the page's colour scheme from the appearance setting, which the theme's
 * colours follow. The port's tests run it against a stand-in page to read
 * the scheme each choice shows. `test/exact-declarations.ts` holds it to
 * the source.
 */
export declare const applyAppearance: (appearance: 'system' | 'light' | 'dark') => void;
