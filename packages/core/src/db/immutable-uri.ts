export const immutableFileUri = (filename: string): string => {
  let uri = filename;
  if (!filename.startsWith('file:')) {
    uri = `file:${filename.split('/').map(encodeURIComponent).join('/')}`;
  }
  let separator = '?';
  if (uri.includes('?')) separator = '&';
  return `${uri}${separator}immutable=1`;
};
