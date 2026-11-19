# manna in Ergo

The port of the manna CLI to [Ergo](https://github.com/cevr/ergo), command by
command; the TypeScript CLI stays the default until the switch unit.

- `bible/`: the Bible domain: `Book` and the canon (`canon.ergo`, generated
  from `packages/core/src/bible/canon.ts` by `scripts/ergo-canon.ts`), `Parse`
  (the reference parser's rules as a typed scanner), `Format`, the `Corpus`
  contract with its laws, `Look` and the text forms. `reference.ergo` holds
  `ParseIsTheReference`, which checks `Parse` against the TypeScript parser's
  recorded answers (`testdata/parse-42.tsv`, `parity/parse-record.ts`).
- `memory/`: an in-memory `Corpus` (the laws' provider).
- `cmd/parse-receipt/`: the receipt driver of `Parse` (`floor/parse` is its Go
  floor).
- `mutants.json`: the port's mutant ledger (`ERGO=… bun scripts/ergo-mutants.ts`).
