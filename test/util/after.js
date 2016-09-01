module.exports = function after (total, next) {
  var i = 0
  return function () {
    if (++i === total) {
      next()
    }
  }
}
