/** Citation corrections read directly from the original 1828 facsimiles.
 *  Raw CSV HTML is retained unchanged in entries.source_html. */
export const referenceCorrections = [
  {
    key: 'charity',
    from: '1 Corinthians 8:1.',
    to: '1 Corinthians 13.',
    scan: 'https://archive.org/details/americandictiona01websrich/page/n373/mode/1up',
  },
  {
    key: 'love',
    from: 'God is love 1 John 4:7.',
    to: 'God is love. 1 John 4.',
    scan: 'https://archive.org/details/americandictiona02websrich/page/n83/mode/1up',
  },
  {
    key: 'prevent',
    from: 'Psalms 119:148.',
    to: 'Psalms 119.',
    scan: 'https://archive.org/details/americandictiona02websrich/page/n353/mode/1up',
  },
] as const;
