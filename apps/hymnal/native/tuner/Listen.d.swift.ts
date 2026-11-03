export declare const Listen: {
  start(): Promise<number>;
  stop(): Promise<void>;
  onFrame(listener: (value0: Uint8Array) => void): () => void;
  onEnd(listener: (value0: string) => void): () => void;
};
