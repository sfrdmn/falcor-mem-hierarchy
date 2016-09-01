// For debugging
module.exports = function print (msg) {
  return function (value) {
    console.log(msg, JSON.stringify(value))
    return value
  }
}
