// A font file a browser module imports: the bundler answers its URL (`player/face.ts`).
declare module '*.woff2' {
  const url: string;
  export default url;
}

// A Rive runtime's wasm and a built rig, imported `with { type: 'file' }`: their URLs (`canvas/rive.ts`).
declare module '*.wasm' {
  const url: string;
  export default url;
}
declare module '*.riv' {
  const url: string;
  export default url;
}

// A cut-out's part PNG, imported `with { type: 'file' }`: its URL in a page, its path in Bun (`canvas/puppet.ts`).
declare module '*.png' {
  const url: string;
  export default url;
}
