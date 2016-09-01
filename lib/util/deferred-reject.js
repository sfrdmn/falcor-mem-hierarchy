module.exports = function deferredReject (err) {
  return new Promise(function (resolve, reject) {
    reject(err)
  })
}
