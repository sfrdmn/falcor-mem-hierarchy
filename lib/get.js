var collapse = require('falcor-path-utils').collapse
var $error = require('falcor-json-graph').error
var Observable = require('zen-observable')
var merge = require('lodash.merge')
var setImmediate = require('set-immediate-shim')

var errors = require('./errors')
var isExpired = require('./is-expired')
var reduceGraph = require('./graph-visitor').reduce
var toPromise = require('./rx-to-promise')
var toRx = require('./es-to-rx')
var deferred = require('./util/deferred')
var deferredReject = require('./util/deferred-reject')

module.exports = function createGet (self, cache, source) {
  return function get (pathSets) {
    return toRx(new Observable(cacheNegotiation(pathSets)))
  }

  function cacheNegotiation (pathSets) {
    return function (observer) {
      // Fallback error handler in case we don't have a more specific one
      var term = fail(observer)
      // Run request on cache
      toPromise(cache.get(pathSets))
        // If cache fails, keep on keepin on in the name of robustness
        .catch(function (err) {
          self._emitCacheError($error({
            status: errors.CACHE_FAIL,
            message: 'Error requesting data from cache',
            detail: err.message
          }))
          return {
            cacheError: true,
            unhandled: pathSets
          }
        })
        // Data sources may return null
        .then(guardUndefined({unmaterialized: pathSets, jsonGraph: {}}))
        .then(function (envelope) {
          // If there was a cache error, we assume the path meta
          // data have already been recorded by the error handler
          if (envelope.cacheError) {
            return envelope
            // Otherwise, it needs to be added
          } else {
            var withMeta = withPathMeta(pathSets, [
              deleteUnhandledValues(envelope.jsonGraph), withHandledPaths,
              withUnhandledPaths, withUnmaterializedPaths
            ])
            return withMeta(envelope)
          }
        })
        .then(rejectIfUnmaterialized('\'Cache\''))
        // Report unmaterialized paths in cache, but then  keep on goin!
        .catch(function (err) {
          self._emitCacheError(err.error)
          return err.envelope
        })
        // Request unhandled paths from upstream
        .then(fetchRemaining(source))
        // Upstream errors are fatal cuz upstream is the boss
        .catch(function (err) {
          observer.error($error({
            status: errors.SOURCE_FAIL,
            message: 'Error requesting data from source',
            detail: err.message
          }))
        })
        // Check if any paths on the source envelope are unmaterialized
        // and error if they are
        .then(function (envelopePair) {
          var cacheEnvelope = envelopePair[0]
          var sourceEnvelope = envelopePair[1]
          var unhandled = cacheEnvelope.unhandled
          // If there were no unhandled paths after the cache fetch
          // the source envelope will be empty
          if (!unhandled) {
            return [cacheEnvelope, sourceEnvelope]
          }
          // Compare fetched envelope with previously unhandled paths
          // to detect unmaterialized paths
          var withMeta = withPathMeta(unhandled, [
            withHandledPaths, withUnmaterializedPaths
          ])

          return deferred(withMeta(sourceEnvelope))
            .then(rejectIfUnmaterialized('\'Source\''))
            // Unmaterialized paths are fatal on upstream
            .catch(function (err) {
              observer.error(err.error)
            })
            .then(function (envelope) {
              return [cacheEnvelope, envelope]
            })
        })
        // Any unhandled data received new from source needs to be updated in cache
        .then(scheduleCacheUpdate(self))
        // Smash those suckas together
        .then(mergeEnvelopes)
        // Get all nice and pretty for the client
        .then(cleanMeta)
        // Blow this joint
        .then(function (envelope) {
          observer.next(envelope)
          observer.complete()
        }, term)
    }
  }
}

/**
 * Would be nice to have immutable data structures, but we don't!
 * Clean up all the stuff that was added in-place
 */
function cleanMeta (envelope) {
  delete envelope.handled
  delete envelope.unhandled
  delete envelope.unmaterialized
  delete envelope.cacheError
  return envelope
}

/**
 * Fetch paths which were on unhandled on the cache
 * from the source.
 */
function fetchRemaining (source) {
  return function (cacheEnvelope) {
    var unhandled = cacheEnvelope.unhandled
    if (!unhandled) {
      return [cacheEnvelope, {jsonGraph: {}}]
    }

    return toPromise(source.get(collapse(unhandled)))
      .then(guardUndefined({jsonGraph: {}}))
      .then(function (sourceEnvelope) {
        return [cacheEnvelope, sourceEnvelope]
      })
  }
}

/**
 * The value for all paths fetched from the upstream must be
 * propagated to the cache
 * Assumes source envelope has no unmaterialized paths
 */
function scheduleCacheUpdate (self) {
  return function (envelopePair) {
    var sourceEnvelope = envelopePair[1]
    if (sourceEnvelope.handled) {
      setImmediate(function () {
        // Copy the envelope because a set call may modify
        // the passed arguments
        var envelope = merge({}, {
          paths: sourceEnvelope.handled,
          jsonGraph: sourceEnvelope.jsonGraph
        })
        self._cacheUpdateQueue.next(envelope)
      })
    }
    return envelopePair
  }
}

function mergeEnvelopes (envelopePair) {
  var cache = envelopePair[0]
  var source = envelopePair[1]
  var paths = (cache.handled || []).concat(source.handled || [])
  return merge({}, cache, source, {paths: paths})
}

function fail (observer) {
  return function (err) {
    observer.error($error({
      status: errors.UNKNOWN,
      message: 'Unknown error',
      detail: err.message
    }))
  }
}

function guardUndefined (fallback) {
  return function (value) {
    return value === void 0 ? fallback : value
  }
}

function rejectIfUnmaterialized (source) {
  return function (envelope) {
    if (envelope.unmaterialized) {
      return deferredReject({
        error: $error({
          status: errors.UNMATERIALIZED,
          message: source + ' has unmaterialized paths',
          unmaterialized: envelope.unmaterialized
        }),
        envelope: envelope
      })
    } else {
      return envelope
    }
  }
}

/**
 * Decorates a JSON Graph envelope with path meta data
 * (which paths were handled, unmaterialized, etc)
 */
function withPathMeta (pathSets, reducers) {
  return function (envelope) {
    return reduceGraph(pathSets, envelope.jsonGraph, reducer, {
      jsonGraph: envelope.jsonGraph
    })
  }

  function reducer (acc, path, value) {
    for (var i = reducers.length - 1; i > -1; i--) {
      acc = reducers[i](acc, path, value)
    }
    return acc
  }
}

function deleteUnhandledValues (graph) {
  return function (acc, path, value) {
    if (isUnhandled(value)) {
      deleteUnmaterialized(graph, path)
    }
    return acc
  }
}

function withUnhandledPaths (acc, path, value) {
  if (isUnhandled(value)) {
    if (!acc.unhandled) acc.unhandled = []
    acc.unhandled.push(path)
  }
  return acc
}

function withUnmaterializedPaths (acc, path, value) {
  if (isUnmaterialized(value)) {
    if (!acc.unmaterialized) acc.unmaterialized = []
    acc.unmaterialized.push(path)
  }
  return acc
}

function withHandledPaths (acc, path, value) {
  if (!isUnhandled(value)) {
    if (!acc.handled) acc.handled = []
    acc.handled.push(path)
  }
  return acc
}

function isUnmaterialized (value) {
  return (value === void 0) ||
    // This condition represents an undefined atom
    value.$type === 'atom' && value.value === void 0
}

function isUnhandled (value) {
  return isUnmaterialized(value) ||
    (value.$type === 'error' || isExpired(value))
}

/**
 * Like a normal property delete by path, except it will delete
 * the first unmaterialized value along the path (instead of strictly
 * the leaf)
 */
function deleteUnmaterialized (graph, path) {
  var currNode = graph
  var length = path.length
  for (var i = 0; i < length; i++) {
    var key = path[i]
    if (isUnmaterialized(currNode[key])) {
      delete currNode[key]
      break
    }
    currNode = currNode[key]
  }
  return graph
}
