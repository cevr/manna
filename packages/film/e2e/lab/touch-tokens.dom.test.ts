import { describe, it } from 'effect-bun-test';
import { SLOW, DEVICES, byPlace, STATES, drawnIn } from './studio-states.ts';

for (const device of DEVICES) {
  describe(`drawn only in its tokens on ${device.name} (G9, DL-9)`, () => {
    for (const [place, state] of byPlace(STATES))
      it.live(
        `${state.name}: every colour, family, size, weight, leading, radius, spacing, shadow and gradient drawn is a token's`,
        () => drawnIn(place, state, device),
        SLOW,
      );
  });
}
