module.exports = Array.from || function (arr) {
  return Array.prototype.slice.call(arr)
}
