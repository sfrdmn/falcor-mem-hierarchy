var stripKeys = require('./strip-keys')

module.exports = function stripModelMeta (envelope) {
  return stripKeys(envelope, ['$__path', '$size'])
}
