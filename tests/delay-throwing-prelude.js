// Couples to the prelude of the worker reading its timers with Map.prototype.values in a function
// named timerDelay. The values of any other map are read as usual.
const { value: values } = Object.getOwnPropertyDescriptor(Map.prototype, "values");
Map.prototype.values = function () {
  if (new Error().stack.includes("timerDelay")) throw new Error("delay failed");
  return values.call(this);
};
