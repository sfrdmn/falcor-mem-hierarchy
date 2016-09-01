/**
 * Get nested value at path
 */
module.exports = function get (obj, path) {
  return path.reduce(function (child, key) {
    return child === void 0 ? child : child[key]
  }, obj)
}
