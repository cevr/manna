import { Array as Arr, Option } from 'effect';

export const pageTitle = (
  names: ReadonlyArray<Option.Option<string>>,
  film: Option.Option<string>,
): string => {
  const said = Arr.getSomes(names);
  return [...said, 'Lab', ...Option.toArray(Option.filter(film, (f) => !said.includes(f)))].join(
    ' · ',
  );
};
