module.exports = function deferred (value) {
  return new Promise(function (resolve) {
    resolve(value)
  })
}
