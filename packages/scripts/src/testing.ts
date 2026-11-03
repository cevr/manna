export const TEST_GIT: ReadonlyArray<string> = [
  '-c',
  'user.name=probe',
  '-c',
  'user.email=probe@example.com',
  '-c',
  'commit.gpgsign=false',
  '-c',
  'core.hooksPath=/nonexistent/test-git-hooks',
  '-c',
  'core.editor=true',
  '-c',
  'maintenance.auto=false',
];
