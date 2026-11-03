import { BunRuntime, BunServices } from '@effect/platform-bun';
import { Console, Effect, Layer, Path } from 'effect';
import { Command, Flag } from 'effect/cli';

import { RECORD, approve } from './approval.ts';
import { layerLab } from './lab-asks.ts';

export const approved = Effect.fn('KitApprove.run')(function* (input: { readonly ask: string }) {
  const path = yield* Path.Path;
  const record = yield* approve(path.dirname(import.meta.dir), input.ask);
  yield* Console.log(
    `${RECORD}: ${Object.keys(record.stills).length} stills, each shown by ask ${input.ask} in the lab at ${record.approval.lab} or by ${record.earlier.length} earlier approvals kept, approved (${record.approval.answer})`,
  );
});

const command = Command.make(
  'kit-approve',
  {
    ask: Flag.String('ask').pipe(
      Flag.withDescription(
        'The lab ask whose image blocks showed the owner every pinned still byte for byte, and whose stills answer is approve',
      ),
    ),
  },
  approved,
).pipe(
  Command.withDescription(
    "Approve the pinned stills: the owner's stills answer is approve and each still's SHA-256 is that of a file an image block of the ask showed",
  ),
);

if (import.meta.main) {
  Command.run(command, { version: '1.0.0' }).pipe(
    Effect.provide(Layer.mergeAll(BunServices.layer, layerLab)),
    BunRuntime.runMain,
  );
}
