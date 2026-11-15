/** The lab's contract test, written from the probe table: a tap and an expectation per row. */
export const contractTest = (rows: Readonly<Record<string, string>>) =>
  [
    'test "each probe row shows what probe-table.json says"',
    '  expect text "title" == "Exact Lab"',
    ...Object.entries(rows).flatMap(([key, text]) => [
      `  tap "ask-${key}"`,
      '  clock settle',
      `  expect text "out-${key}" == "${text}"`,
    ]),
    '',
  ].join('\n');
