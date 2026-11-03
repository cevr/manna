import { Toast } from '@manna/ui/toast';
import { For } from '@solidjs/web';
import { Equal, Option, Schema } from 'effect';
import { createEffect, createSignal, onCleanup, onSettled, untrack } from 'solid-js';
import { type StoreRuntime, keptJson } from '../../browser/storage.ts';
import { BY_BUTTON, type Bound, Receipt, Unfit, unfit } from '../../command/command.ts';
import type { Hub } from '../../command/hub.ts';
import { OpId } from '../../core/catalogue.ts';
import { ChangeId } from '../../core/schema.ts';
import { hubChanges } from './changes.ts';

const SHOWN_FOR = { done: 5000, refused: 10000, busy: 0 } as const;

const ChangeKept = Schema.Struct({ film: Schema.String, change: ChangeId });

const GaveKept = Schema.Struct({
  film: Schema.String,
  gave: Schema.Struct({
    op: OpId,
    scenes: Schema.Array(Schema.String),
    of: Schema.optionalKey(Schema.Struct({ point: Schema.String, version: Schema.String })),
  }),
});

const NoteKept = Schema.Struct({ film: Schema.String, note: Schema.String });

const Kept = Schema.Struct({
  slot: Schema.String,
  said: Schema.String,
  undo: Schema.OptionFromOptionalKey(Schema.String),
  bound: Schema.OptionFromOptionalKey(Schema.Union([ChangeKept, GaveKept, NoteKept])),
  tone: Schema.Literals(['done', 'refused', 'busy']),
  held: Schema.OptionFromOptionalKey(Schema.String),
});
type Kept = typeof Kept.Type;

const Carried = Schema.Struct({ scope: Schema.String, receipts: Schema.Array(Kept) });

const KEPT_AS = 'film-receipts';

export const Receipts = (props: {
  readonly hub: Hub;
  readonly tab: StoreRuntime;
  readonly scope: string;
}) => {
  const manager = Toast.createToastManager<Kept>();
  const showing = new Map<string, Kept>();
  const named = new Map<string, string>();
  const [held, setHeld] = createSignal<ReadonlyArray<Kept>>([], { ownedWrite: true });
  const changes = hubChanges(props.hub);
  const undoLabel = (id: string) =>
    Option.match(props.hub.commands.byId(id), { onNone: () => 'Undo', onSome: (c) => c.label });
  const labelOf = (kept: Kept) => Option.match(kept.undo, { onNone: () => '', onSome: undoLabel });
  const whyNot = (id: string, bound: Option.Option<Bound>): Option.Option<Unfit> => {
    const ctx = props.hub.context();
    const notNow = Option.some(Unfit.Now({ reason: `${undoLabel(id)} is not available now` }));
    return Option.match(props.hub.commands.byId(id), {
      onNone: () => notNow,
      onSome: (c) =>
        Option.orElse(
          Option.flatMap(bound, (b) => unfit(c, b, ctx)),
          () => Option.filter(notNow, () => !c.when(ctx)),
        ),
    });
  };
  const judged = (kept: Kept, why: Option.Option<Unfit>): Kept =>
    Option.match(why, {
      onNone: () => ({ ...kept, held: Option.none() }),
      onSome: Unfit.$match({
        Now: ({ reason }) => ({ ...kept, held: Option.some(reason) }),
        Never: ({ reason }) => ({
          ...kept,
          said: reason,
          tone: 'refused' as const,
          undo: Option.none(),
          bound: Option.none(),
          held: Option.none(),
        }),
      }),
    });
  const show = (kept: Kept) => {
    showing.set(kept.slot, kept);
    named.set(kept.slot, labelOf(kept));
    setHeld((all) => [
      ...all.filter((k) => k.slot !== kept.slot),
      ...[kept].filter((k) => Option.isSome(k.held)),
    ]);
    const held = kept.held;
    manager.add({
      id: kept.slot,
      title: Option.getOrElse(held, () => kept.said),
      type: Option.match(held, { onNone: () => kept.tone, onSome: () => 'refused' }),
      timeout: Option.match(held, { onNone: () => SHOWN_FOR[kept.tone], onSome: () => 0 }),
      data: kept,
      onRemove: () => {
        if (showing.get(kept.slot) !== kept) return;
        showing.delete(kept.slot);
        named.delete(kept.slot);
        setHeld((all) => all.filter((k) => k !== kept));
      },
      actionProps: Option.getOrUndefined(
        Option.map(kept.undo, (id) => ({
          children: undoLabel(id),
          'data-act': 'receipt-undo',
          'data-command': id,
          onClick: () => {
            const why = whyNot(id, kept.bound);
            if (Option.isSome(why)) return show(judged(kept, why));
            manager.close(kept.slot);
            props.hub.invokeId(
              id,
              Option.match(kept.bound, {
                onNone: () => BY_BUTTON,
                onSome: (bound) => ({ ...BY_BUTTON, bound }),
              }),
            );
          },
        })),
      ),
    });
  };
  createEffect(
    () => {
      changes();
      held();
      return [...showing.values()].map((kept) => ({
        kept,
        label: labelOf(kept),
        next: Option.match(kept.held, {
          onNone: () => kept,
          onSome: () =>
            judged(
              kept,
              Option.flatMap(kept.undo, (id) => whyNot(id, kept.bound)),
            ),
        }),
      }));
    },
    (now) =>
      untrack(() => {
        for (const { kept, label, next } of now) {
          if (showing.get(kept.slot) !== kept) continue;
          if (Equal.equals(next, kept) && named.get(kept.slot) === label) continue;
          show(next);
        }
      }),
  );

  onCleanup(
    props.hub.receipts((receipt, slot) =>
      Receipt.$match(receipt, {
        Quiet: () => {},
        Said: (s) =>
          show({
            slot,
            said: s.said,
            undo: s.undo,
            bound: s.bound,
            tone: s.tone,
            held: Option.none(),
          }),
      }),
    ),
  );

  onSettled(() => {
    const carried = keptJson(props.tab, KEPT_AS, Carried, (): typeof Carried.Type => ({
      scope: '',
      receipts: [],
    }));
    const was = carried.get();
    carried.set({ scope: '', receipts: [] });
    if (was.scope === props.scope) for (const kept of was.receipts) show(kept);
    const keep = () => carried.set({ scope: props.scope, receipts: [...showing.values()] });
    window.addEventListener('pagehide', keep);
    return () => window.removeEventListener('pagehide', keep);
  });

  return (
    <Toast.Provider toastManager={manager} limit={3}>
      <Toast.Portal>
        <Toast.Viewport class="lab-receipts" data-role="receipts">
          <ReceiptList />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  );
};

const ReceiptList = () => {
  const toasts = Toast.useToastManager<Kept>();
  return (
    <For each={toasts.toasts} keyed={(t) => t.id}>
      {(t) => (
        <Toast.Root
          toast={t()}
          class="lab-receipt"
          data-role="receipt"
          data-receipt={t().id}
          swipeDirection={['down', 'right']}
        >
          <Toast.Content class="lab-receipt-content">
            <Toast.Title class="lab-receipt-said" />
            <Toast.Action class="lab-receipt-undo" />
            <Toast.Close class="lab-receipt-close" aria-label="Dismiss">
              ×
            </Toast.Close>
          </Toast.Content>
        </Toast.Root>
      )}
    </For>
  );
};
