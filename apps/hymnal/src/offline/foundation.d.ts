import 'one/ios/Foundation';

// One 2.11.1's generated facade has this constructor; its declaration omits it.
// Keep the app declaration equal to ios-bindings/Foundation.ts.
declare module 'one/ios/Foundation' {
  namespace NSURL {
    function initString(uri: string): NSURL | null;
  }
}
