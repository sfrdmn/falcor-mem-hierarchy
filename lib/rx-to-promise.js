/*
 * @param RX.Observable<T>
 * @return Promise<T>
 */
module.exports = function asPromise (observable) {
  var result
  return new Promise(function (resolve, reject) {
    observable.subscribe({
      onNext: function (value) {
        if (result !== void 0) {
          reject(new Error('Observable emitted multiple values'))
        } else {
          result = value
        }
      },
      onError: reject,
      onCompleted: function () {
        resolve(result)
      }
    })
  })
}
