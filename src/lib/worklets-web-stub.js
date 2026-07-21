/**
 * Empty stub for react-native-worklets on web.
 * Prevents WorkletsError #8285 during module init.
 */
module.exports = {
  __esModule: true,
  WorkletsModule: {},
  createSerializable: (v) => v,
  createWorkletRuntime: () => ({}),
  runOnUI: (fn) => fn,
  runOnJS: (fn) => fn,
  shareableMappingCache: new Map(),
};
