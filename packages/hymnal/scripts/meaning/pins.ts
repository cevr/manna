/**
 * What the meaning table is built from, pinned: the model (EmbeddingGemma
 * v1, 300M, its ONNX export at fp32), the English word list (BERT's
 * uncased vocabulary), and the runtime that runs the model. Each file is
 * fetched from its repository at a fixed revision and checked against its
 * SHA-256 before it is used (`fetch.ts`); a file that differs fails the build.
 */

export interface Pinned {
  readonly path: string;
  readonly size: number;
  readonly sha256: string;
}

export interface Source {
  readonly repo: string;
  readonly revision: string;
  readonly files: ReadonlyArray<Pinned>;
}

/** EmbeddingGemma v1 (Gemma Terms of Use), the ONNX export the research measured. */
export const MODEL: Source = {
  repo: 'onnx-community/embeddinggemma-300m-ONNX',
  revision: '5090578d9565bb06545b4552f76e6bc2c93e4a66',
  files: [
    {
      path: 'config.json',
      size: 1765,
      sha256: '6e1f06404b7163e0325ed2ea3e6781cde50f4a50b31780a95ad0d30e8404d77b',
    },
    {
      path: 'tokenizer.json',
      size: 20323312,
      sha256: '4dda02faaf32bc91031dc8c88457ac272b00c1016cc679757d1c441b248b9c47',
    },
    {
      path: 'tokenizer_config.json',
      size: 1156830,
      sha256: '3ca953eea6c3c9fcda9cf3df22949ff18b216f7c74bd6459230f3f1013953f3a',
    },
    {
      path: 'special_tokens_map.json',
      size: 662,
      sha256: '2f7b0adf4fb469770bb1490e3e35df87b1dc578246c5e7e6fc76ecf33213a397',
    },
    {
      path: 'added_tokens.json',
      size: 35,
      sha256: '50b2f405ba56a26d4913fd772089992252d7f942123cc0a034d96424221ba946',
    },
    {
      path: 'onnx/model.onnx',
      size: 479932,
      sha256: 'ea91fd315a7c152d427d231746f0f811a1ac93beaba656abfdf2b24e091265e4',
    },
    {
      path: 'onnx/model.onnx_data',
      size: 1234521088,
      sha256: 'ef835ae565d8695236652475903078e8ed794c7c35faf1164d78ec3238e8a88d',
    },
  ],
};

/** BERT's uncased vocabulary (Apache 2.0): its whole words are the English the table knows beside the hymnal's own. */
export const VOCABULARY: Source = {
  repo: 'google-bert/bert-base-uncased',
  revision: '86b5e0934494bd15c9632b12f734a8a67f723594',
  files: [
    {
      path: 'vocab.txt',
      size: 231508,
      sha256: '07eced375cec144d27c900241f3e339478dec958f92fddbc551f295c992038a3',
    },
  ],
};

/** The runtime, installed into the cache (never the repo): transformers.js and the ONNX runtime it runs on. */
export const RUNTIME = {
  dependencies: { '@huggingface/transformers': '4.3.1' },
  overrides: {
    'onnxruntime-node': '1.30.0',
    'onnxruntime-common': '1.30.0',
    '@huggingface/tokenizers': '0.2.0',
    '@huggingface/jinja': '0.5.10',
  },
} as const;

/** EmbeddingGemma's prompts: a query, and a document with its title. */
export const queryPrompt = (text: string) => `task: search result | query: ${text}`;
export const documentPrompt = (title: string, text: string) => `title: ${title} | text: ${text}`;

/** The model's full width: the table keeps every dimension. */
export const DIMS = 768;

/** Words per model call, and the runtime's threads: fixed, so two builds run the same arithmetic. */
export const BATCH = 64;
export const THREADS = 4;
