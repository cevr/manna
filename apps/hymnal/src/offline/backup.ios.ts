/* oxlint-disable effect/noThrowStatement -- synchronous Foundation boundary; the caller wraps it in the storage Promise operation. */
import { NSURL, URLResourceKey } from 'one/ios/Foundation';

/** Exclude the app-owned directory and all children before any media write. */
export const protectDirectory = (uri: string): void => {
  const directory = NSURL.initString(uri);
  if (!directory) throw Error('recording directory URI');
  directory.setResourceValue(true, URLResourceKey.isExcludedFromBackupKey);
  directory.removeCachedResourceValue(URLResourceKey.isExcludedFromBackupKey);
  if (directory.getResourceValue(URLResourceKey.isExcludedFromBackupKey).$out.value !== true)
    throw Error('recording backup exclusion');
};
