var $error = require('falcor-json-graph').error
var Observable = require('zen-observable')

var errors = require('./errors')
var toPromise = require('./rx-to-promise')
var toRx = require('./es-to-rx')
var deferredReject = require('./util/deferred-reject')

module.exports = function createSet (self, cache, source) {
  return function set (envelope) {
    envelope = envelope || {paths: [], jsonGraph: {}}
    if (!envelope.paths) {
      envelope.paths = []
    }
    if (!envelope.jsonGraph) {
      envelope.jsonGraph = {}
    }
    return toRx(new Observable(cacheNegotiation(envelope)))
  }

  function cacheNegotiation (envelope) {
    return function (observer) {
      toPromise(source.set(envelope))
        .catch(function (err) {
          observer.error($error({
            status: errors.SOURCE_FAIL,
            message: 'Failed to run set operation on source',
            detail: err.message
          }))
        })
        .then(propagateToCache(cache))
        .catch(function (err) {
          self._emitCacheError($error({
            status: errors.CACHE_FAIL,
            message: 'Failed to run set operation on cache',
            detail: err.error.message
          }))
          return err.envelope
        })
        .then(function (envelope) {
          observer.next(envelope)
          observer.complete()
        })
    }
  }
}

function propagateToCache (cache) {
  return function (envelope) {
    return toPromise(cache.set(envelope))
      .catch(function (err) {
        return deferredReject({
          error: err,
          envelope: envelope
        })
      })
  }
}
