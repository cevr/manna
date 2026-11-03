Reflect.deleteProperty(console, 'createTask');
Reflect.deleteProperty(console, 'timeStamp');
Object.defineProperty(Error, 'stackTraceLimit', { get: () => 0, set() {} });
