/**
 * Taken from falcor/lib/get/util/isExpired.js
 * TODO Maybe this should be in falcor-json-graph?
 */
module.exports = function isExpired (node) {
  var $expires = node.$expires === void 0 && -1 || node.$expires
  return $expires !== -1 && $expires !== 1 && ($expires === 0 || $expires < Date.now())
}
