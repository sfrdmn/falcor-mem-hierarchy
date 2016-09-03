var $error = require('falcor-json-graph').error
var Observable = require('zen-observable')

var toRx = require('./es-to-rx')

var errors = require('./errors')
var createGet = require('./get')
var createSet = require('./set')
var createCall = require('./call')

function HierarchicalDataSource (cache, source) {
  if (!cache) throw new Error('No cache data source provided')
  if (!source) throw new Error('No source data source provided')
  this._cache = cache
  this._source = source
  this._emitCacheError = noop
  this._cacheUpdateQueue = {next: noop}
  this._cacheUpdates = new Observable(function (observer) {
    this._cacheUpdateQueue = observer
  }.bind(this))
  this._cacheUpdates.subscribe(cacheUpdater(this))

  this.get = createGet(this, cache, source)
  this.set = createSet(this, cache, source)
  this.call = createCall(this, cache, source)
}

HierarchicalDataSource.prototype.cacheErrors = function () {
  if (!this._cacheErrorObserver) {
    return toRx(new Observable(function (observer) {
      this._cacheErrorObserver = observer
      this._emitCacheError = observer.next.bind(observer)
    }.bind(this)))
  } else {
    return toRx(new Observable(this._cacheErrorObserver))
  }
}

/**
 * Create an observer for the cache update queue which
 * will run set operations on the cache
 * Assumes only valid JSONGraph is put on the queue
 */
function cacheUpdater (self) {
  return {
    next: function (jsonGraph) {
      self._cache.set(jsonGraph).subscribe(noop, cacheUpdateError)
    },
    error: cacheUpdateError
  }

  function cacheUpdateError (err) {
    self._emitCacheError($error({
      status: errors.CACHE_FAIL,
      message: 'Error updating cache with new upstream data',
      detail: err.message
    }))
  }
}

function noop () {}

module.exports = HierarchicalDataSource
module.exports.errorCodes = errors
