var $error = require('falcor-json-graph').error
var Observable = require('zen-observable')
var merge = require('lodash.merge')

var from = require('./util/from')
var deferred = require('./util/deferred')
var deferredReject = require('./util/deferred-reject')
var toPromise = require('./rx-to-promise')
var toRx = require('./es-to-rx')

var errors = require('./errors')

module.exports = function createCall (self, cache, source) {
  return function call () {
    return toRx(new Observable(cacheNegotiation.apply(null, arguments)))
  }

  function cacheNegotiation (callPath) {
    var callArgs = from(arguments)
    return function (observer) {
      toPromise(source.call.apply(source, callArgs))
        .catch(function (err) {
          observer.error($error({
            status: errors.SOURCE_FAIL,
            message: 'Could not call ' + JSON.stringify(callPath) + ' on source',
            detail: err.message
          }))
        })
        .then(propagateToCache(cache))
        .catch(function (err) {
          self._emitCacheError($error({
            status: errors.CACHE_FAIL,
            message: 'Could not call ' + JSON.stringify(callPath) + ' on cache',
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
    // Copy envelope since setter may modify it
    return toPromise(cache.set(merge({}, envelope)))
      .catch(function (err) {
        return deferredReject({
          envelope: envelope,
          error: err
        })
      })
      // If successful, return the original call response
      .then(deferred(envelope))
  }
}
