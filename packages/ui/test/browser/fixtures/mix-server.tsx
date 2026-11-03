import { renderToString } from '@solidjs/web';

import { Parity } from './mix-parity.tsx';

export const render = (): { html: string; reported: Array<string> } => {
  const reported: Array<string> = [];
  const html = renderToString(() => <Parity report={(line) => reported.push(line)} />);
  return { html, reported };
};
