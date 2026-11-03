/** `file:` URI form of a filesystem path, with `immutable=1` appended.
 *
 *  `encodeURIComponent` per path segment is correct here where `encodeURI` over
 *  the whole path is not. `encodeURI` deliberately preserves the URI
 *  *delimiters*, `?` and `#` among them, so a directory literally named
 *  `weird?dir#1` produced a URI whose query string began in the middle of the
 *  path. SQLite parses that query string, so it opened a **different, shorter**
 *  path than the one the caller had already stat'ed — and with `immutable=1`
 *  appended after a `#`, the flag landed inside a fragment and did nothing.
 *
 *  Segment-at-a-time is what keeps `/` a separator while everything inside a
 *  segment is escaped. A caller that already holds a `file:` URI is trusted to
 *  have encoded it; only the flag is added. */
export const immutableFileUri = (filename: string): string => {
  let uri = filename;
  if (!filename.startsWith('file:')) {
    uri = `file:${filename.split('/').map(encodeURIComponent).join('/')}`;
  }
  let separator = '?';
  if (uri.includes('?')) separator = '&';
  return `${uri}${separator}immutable=1`;
};
