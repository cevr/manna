import Root from '../../app/index';
import { ChoicesOnToday } from '../settings/choices';
import { allowChoicesOnToday } from './root-rule';

/**
 * The root as the rigs that still tap Today's `Minutes` and `Voice` mount
 * it: under `ChoicesOnToday`, with `host` registered to the root's rule so
 * Today's choices are no fault under it, and nowhere else. It is the one
 * place a host is registered, so the provider and the rule's exemption go
 * together. S2-S4 drop its users as they move their taps to the Settings
 * sheet; S5 deletes it.
 */
export const rootWithChoicesOnToday = (host: Element) => {
  allowChoicesOnToday(host);
  return (
    <ChoicesOnToday value>
      <Root />
    </ChoicesOnToday>
  );
};
