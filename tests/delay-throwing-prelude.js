// Couples to the worker defining `__timerDelay` with Object.assign on the global.
// A setter that drops the definition of the worker leaves this getter as the global.
Object.defineProperty(globalThis, "__timerDelay", {
  get: () => () => {
    throw new Error("delay failed");
  },
  set() {},
});
