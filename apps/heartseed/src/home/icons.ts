import addDark from '../../assets/home/add-dark.png';
import addLight from '../../assets/home/add-light.png';
import bladeDark from '../../assets/home/blade-dark.png';
import bladeLight from '../../assets/home/blade-light.png';
import bowDark from '../../assets/home/bow-dark.png';
import bowLight from '../../assets/home/bow-light.png';
import cornDark from '../../assets/home/corn-dark.png';
import cornLight from '../../assets/home/corn-light.png';
import earDark from '../../assets/home/ear-dark.png';
import earLight from '../../assets/home/ear-light.png';
import gearDark from '../../assets/home/gear-dark.png';
import gearLight from '../../assets/home/gear-light.png';
import harpDark from '../../assets/home/harp-dark.png';
import harpLight from '../../assets/home/harp-light.png';
import lampDark from '../../assets/home/lamp-dark.png';
import lampLight from '../../assets/home/lamp-light.png';
import moonDark from '../../assets/home/moon-dark.png';
import moonLight from '../../assets/home/moon-light.png';
import scrollDark from '../../assets/home/scroll-dark.png';
import scrollLight from '../../assets/home/scroll-light.png';
import seedDark from '../../assets/home/seed-dark.png';
import seedLight from '../../assets/home/seed-light.png';
import sunDark from '../../assets/home/sun-dark.png';
import sunLight from '../../assets/home/sun-light.png';
import type { HomeIcon } from '../home';
import type { Scheme } from '../theme';

/**
 * The home's hand-drawn icons, one PNG per name and scheme, as
 * `bun run home-icons` draws them from `assets/home/<name>.svg`. Under One
 * each is an asset id an `Image` takes as its source; a name added to
 * `HOME_ICONS` without its two PNGs fails the typecheck.
 */
export const ICON_IMAGES = {
  add: { light: addLight, dark: addDark },
  blade: { light: bladeLight, dark: bladeDark },
  bow: { light: bowLight, dark: bowDark },
  corn: { light: cornLight, dark: cornDark },
  ear: { light: earLight, dark: earDark },
  gear: { light: gearLight, dark: gearDark },
  harp: { light: harpLight, dark: harpDark },
  lamp: { light: lampLight, dark: lampDark },
  moon: { light: moonLight, dark: moonDark },
  scroll: { light: scrollLight, dark: scrollDark },
  seed: { light: seedLight, dark: seedDark },
  sun: { light: sunLight, dark: sunDark },
} as const satisfies Readonly<Record<HomeIcon, Readonly<Record<Scheme, number>>>>;
