/**
 * The domain's mail, owned by the stack (`../../alchemy.run.ts`):
 *
 * - `SendingDomain`: the domain onboarded to Email Sending, which the list's
 *   letters are sent from (`FROM`, `../mail/mailer.ts`). On Cloudflare DNS
 *   its records (DKIM, SPF and the bounce path) are added for it. Message
 *   previews are off, so Cloudflare keeps no copy of a letter; Email Sending
 *   has no open or click tracking to turn off, and the letters carry none
 *   (`../mail/letters.ts`). Every stage declares it, takes the one already
 *   there, and never deletes it: prod and a throwaway stage send from the
 *   same domain, so destroying one must not stop the other.
 * - In prod, the contact address (`CONTACT`): Email Routing on the zone
 *   (`MailRouting`) and one rule (`Contact`) that hands the contact
 *   address's mail to the Site Worker, named by the Site's own output so the
 *   rule follows the Worker's update. The Worker forwards it to the owner's
 *   inbox, the store secret `MAIL_FORWARD_TO` (`./Site.ts`,
 *   `../mail/contact.ts`), so no deploy reads it. The inbox is registered
 *   and verified as a destination address in the dashboard, outside the
 *   stack: Cloudflare forwards only to a verified destination.
 */
import * as Alchemy from 'alchemy';
import type { Output } from 'alchemy/Output';
import * as Cloudflare from '@alchemy.run/cloudflare';
import { Stage } from 'alchemy/Stage';
import { Effect } from 'effect';

import { CONTACT, DOMAIN } from '../site.ts';

/** The contact address handed to the Site Worker `workerName`: prod's alone. */
const contact = (workerName: Output<string>) =>
  Effect.gen(function* () {
    const routing = yield* Cloudflare.Email.Routing('MailRouting', { zone: DOMAIN });
    yield* Cloudflare.Email.Rule('Contact', {
      zone: { zoneId: routing.zoneId, name: DOMAIN },
      name: 'Contact',
      matchers: [{ type: 'literal', field: 'to', value: CONTACT }],
      actions: [{ type: 'worker', value: [workerName] }],
    });
  });

/** The domain's mail, its contact rule handing mail to the Site Worker `workerName`. */
export const mailDomain = (workerName: Output<string>) =>
  Effect.gen(function* () {
    const zone = yield* Cloudflare.Zone.Zone('Zone', { name: DOMAIN }).pipe(
      Alchemy.AdoptPolicy.adopt(true),
    );
    const sending = yield* Cloudflare.Email.SendingSubdomain('SendingDomain', {
      zoneId: zone.zoneId,
      name: DOMAIN,
      previewEnabled: false,
    }).pipe(Alchemy.AdoptPolicy.adopt(true), Alchemy.RemovalPolicy.retain());
    if ((yield* Stage) === 'prod') yield* contact(workerName);
    return { sending: sending.enabled };
  });
