module.exports = function stripKeys (obj, keys) {
  return Object.keys(obj).reduce(function (obj, key) {
    if (~keys.indexOf(key)) {
      delete obj[key]
    } else if (typeof obj[key] === 'object') {
      obj[key] = stripKeys(obj[key], keys)
    }
    return obj
  }, obj)
}
