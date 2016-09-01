module.exports = Array.from ? Array.from : function (arrayIsh) {
  return Array.prototype.slice.call(arrayIsh)
}
