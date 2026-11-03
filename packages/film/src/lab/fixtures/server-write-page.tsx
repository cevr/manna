import { createSignal } from 'solid-js';
import { pageRender } from '../page-server.tsx';

export const writingRender = pageRender({
  bodyClass: 'probe',
  rootClass: 'probe-root',
  style: '',
  app: () => {
    const [count, setCount] = createSignal(0);
    setCount(1);
    return <p>{count()}</p>;
  },
});

export const readingRender = pageRender({
  bodyClass: 'probe',
  rootClass: 'probe-root',
  style: '',
  app: () => {
    const [count] = createSignal(1);
    return <p>{count()}</p>;
  },
});
