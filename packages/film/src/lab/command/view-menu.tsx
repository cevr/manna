import { Option } from 'effect';
import type { Hub } from '../../command/hub.ts';
import { viewRows } from '../../command/menu.ts';
import { KEYS_SHEET_COMMAND } from './keys-sheet.tsx';
import { RowsMenu } from './command-chip.tsx';

export const ViewMenu = (props: { readonly hub: Hub }) => (
  <RowsMenu
    hub={props.hub}
    rows={(available, ctx) =>
      viewRows(available, ctx, Option.toArray(props.hub.commands.byId(KEYS_SHEET_COMMAND)))
    }
    role="view-menu"
    align="end"
    title="View"
    label="View menu"
    act="view-menu"
    class="sh-tool"
  >
    <svg class="sh-icon sh-dots" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="5" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="19" cy="12" r="1.6" />
    </svg>
  </RowsMenu>
);
