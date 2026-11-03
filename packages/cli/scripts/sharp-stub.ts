const unavailable = (): never => {
  throw new Error('sharp is not bundled into the compiled manna CLI (text-only build)');
};

export default unavailable;
