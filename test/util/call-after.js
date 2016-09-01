module.exports = function callAfter (timestamp, cb, cushion) {
  cushion = cushion || 10
  check()
  
  function check () {
    var now = Date.now()
    if (now > timestamp + cushion) {
      cb()
    } else {
      setTimeout(check, timestamp - now)
    }
  }
}
