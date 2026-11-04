import { Schema } from 'effect';
import { Palette } from '../../../library/storybook/sheet.ts';
import FEAST_GUEST_MAN from '../../../library/cast/feast-guest-man/cast-sheet/palette.json' with { type: 'json' };
import FEAST_GUEST_WOMAN from '../../../library/cast/feast-guest-woman/cast-sheet/palette.json' with { type: 'json' };
import FILLER_DRESSED from '../../../library/cast/filler-dressed/cast-sheet/palette.json' with { type: 'json' };
import LEAD_FEAST from '../../../library/cast/lead-feast/cast-sheet/palette.json' with { type: 'json' };
import VILLAGER_CHILD from '../../../library/cast/villager-child/cast-sheet/palette.json' with { type: 'json' };
import VILLAGER_TODDLER from '../../../library/cast/villager-toddler/cast-sheet/palette.json' with { type: 'json' };
import FEAST_MOTHER from '../cast/feast-mother/cast-sheet/palette.json' with { type: 'json' };
import IDEA_VILLAGERS from '../cast/idea-villagers/cast-sheet/palette.json' with { type: 'json' };

const decode = Schema.decodeUnknownSync(Palette);

/** Each member act 1 casts, its palette as its `palette.json` holds it, decoded once. */
export const PALETTES: ReadonlyMap<string, Palette> = new Map([
  ['lead-feast', decode(LEAD_FEAST)],
  ['feast-guest-man', decode(FEAST_GUEST_MAN)],
  ['feast-guest-woman', decode(FEAST_GUEST_WOMAN)],
  ['filler-dressed', decode(FILLER_DRESSED)],
  ['villager-child', decode(VILLAGER_CHILD)],
  ['villager-toddler', decode(VILLAGER_TODDLER)],
  ['feast-mother', decode(FEAST_MOTHER)],
  ['idea-villagers', decode(IDEA_VILLAGERS)],
]);
