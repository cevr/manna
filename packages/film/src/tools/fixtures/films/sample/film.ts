// The synthetic film's declared rate and look: two acts, each from its first scene.

/** The frames a second it is laid at: the tools read it here, as a film's page does. */
export const fps = 24;

export const look = {
  acts: [
    { from: 'open', name: 'open', chapter: 'A question?', luma: [140, 160] },
    { from: 'title', name: 'title', chapter: 'An answer', luma: [150, 165] },
  ],
};
