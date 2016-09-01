module.exports = function get (obj, path) {
  return path.reduce(function (child, key) {
    return child !== void 0 ? child[key] : void 0
  }, obj)
}
