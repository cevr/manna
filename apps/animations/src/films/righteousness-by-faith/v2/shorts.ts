import type { Shorts } from '@manna/film/core';

export const shorts = [
  {
    id: 'verdict',
    title: "Is God's verdict a cover-up?",
    hook: "Is God's verdict a cover-up?",
    spans: [
      { scene: 'cold', from: { mark: 'evidence' }, to: { mark: 'oldest' } },
      { scene: 'declared', from: { mark: 'paul' }, to: { at: 'speechEnd' } },
      { scene: 'name', from: { mark: 'how' }, to: { mark: 'jer' } },
    ],
  },
  {
    id: 'mirror',
    title: "You can't wash your face with a mirror",
    hook: "You can't wash your face with a mirror.",
    spans: [
      { scene: 'mirror', from: { mark: 'fig' }, to: { at: 'speechEnd' } },
      { scene: 'look', from: { at: 'speech' }, to: { mark: 'desert' } },
    ],
  },
] as const satisfies Shorts;
