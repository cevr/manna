// The ask page's server entry: the lab renders the page of asks with it
// first (`LAB_SERVERS`), and `ask.ts` hydrates it. It imports none of the
// app's films: a Board panel's still is drawn from its file.

export { askRender as default } from '@manna/film/ask-server';
