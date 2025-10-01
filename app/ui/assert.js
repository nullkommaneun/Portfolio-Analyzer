// app/util/assert.js
export function assert(cond, msg='Assertion failed'){
  if (!cond) throw new Error(msg);
}
