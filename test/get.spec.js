var test = require('tape')
var falcor = require('falcor')
var jsonGraph = require('falcor-json-graph')
var $error = jsonGraph.error
var $atom = jsonGraph.atom
var Observable = require('rx').Observable

var expandValues = require('./util/expand-values')
var stripModelMeta = require('./util/strip-model-meta')
var get = require('./util/get')
var after = require('./util/after')
var callAfter = require('./util/call-after')

var HierarchicalDataSource = require('..')
var errorCodes = HierarchicalDataSource.errorCodes

test('model integration is sane for gets', function (t) {
  t.plan(2)
  var cache = datasource({
    byId: {0: {name: 'Sean',
               bio: 'too legit to quit'}}
  })
  var source = datasource({})
  var model = new falcor.Model({
    source: new HierarchicalDataSource(cache, source)
  })

  getSingleVal(getMultiVals)

  function getSingleVal (next) {
    model.getValue(['byId', 0, 'name']).then(function (value) {
      t.equal(value, 'Sean', 'getValue call ok')
      next()
    }).catch(function (err) {
      t.error(err, 'could not get single value')
    })
  }

  function getMultiVals () {
    model.get(['byId', 0, ['name', 'bio']]).then(function (value) {
      t.deepEqual(stripModelMeta(value), {
        json: {byId: {0: {name: 'Sean',
                          bio: 'too legit to quit'}}}
      }, 'get call ok')
    }).catch(function (err) {
      t.error(err, 'could not get multiple values')
    })
  }
})

test('data source understands ranges and complex ranges', function (t) {
  t.plan(2)
  var cache = datasource({byId: {0: {msg: 'hello'},
                                 24: {msg: 'get outta here'}}})
  var source = datasource({byId: {1: {msg: 'hello!'},
                                    2: {msg: 'hello!!!'}}})
  var cachedSource = new HierarchicalDataSource(cache, source)

  fetchRange(fetchComplexRange)

  function fetchRange (next) {
    cachedSource.get([['byId', {from: 0, to: 2}, 'msg']]).subscribe(function (envelope) {
      t.deepEqual(expandValues(envelope.jsonGraph), {
        byId: {0: {msg: 'hello'},
               1: {msg: 'hello!'},
               2: {msg: 'hello!!!'}}
      }, 'got range of values')
      next()
    }, function (err) {
      t.error(err)
    })
  }

  function fetchComplexRange () {
    cachedSource.get([['byId', [{from: 0, to: 1}, 24], 'msg']]).subscribe(function (envelope) {
      t.deepEqual(expandValues(envelope.jsonGraph), {
        byId: {0: {msg: 'hello'},
               1: {msg: 'hello!'},
               24: {msg: 'get outta here'}}
      }, 'got complex range of values')
    }, function (err) {
      t.error(err)
    })
  }
})

test('returned graph envelope paths are sane', function (t) {
  t.plan(1)
  var cache = datasource({byId: {0: {orientation: 'boastful'},
                                 23: {orientation: $error('no tengo'),
                                      favoriteColor: $error('nada')}}})
  var source = datasource({byId: {23: {favoriteColor: 'light blue',
                                       orientation: 'demonic'}}})
  var cachedSource = new HierarchicalDataSource(cache, source)
  var pathSets = [['byId', 0, 'orientation'],
                  ['byId', 23, 'favoriteColor'],
                  ['byId', 23, 'orientation']]
  cachedSource.get(pathSets).subscribe(function (envelope) {
    // TODO Should actually be a set comparison to be resilient against
    // implementation changes
    t.deepEqual(envelope.paths, pathSets)
  }, function (err) {
    t.error(err)
  })
})

test('cache hits overshadow upstream', function (t) {
  t.plan(1)
  var cache = datasource({byId: {0: {name: 'juju beans',
                                     age: $error('nope')}}})
  var source = datasource({byId: {0: {name: 'timbuktu', age: 'thousands of years'}}})
  var cachedSource = new HierarchicalDataSource(cache, source)
  cachedSource.get([['byId', 0, ['name', 'age']]]).subscribe(function (result) {
    t.deepEqual(expandValues(result.jsonGraph), {
      byId: {0: {name: 'juju beans',
                        age: 'thousands of years'}}
    }, 'gets values from two sources, prioritizing cache')
  }, function (err) {
    t.error(err)
  })
})

test('handles unmaterialized paths', function (t) {
  t.plan(3)
  var cache = datasource({byId: {0: {name: 'Bobob', occupation: $error('ionno')}}})
  var source = datasource({byId: {0: {age: 3000}}})
  var cachedSource = new HierarchicalDataSource(cache, source)

  checkCache(checkUpstream)

  // Unmaterialized paths on cache are not fatal, instead they're
  // emitted on a separate error channel
  function checkCache (next) {
    var nextIfDone = after(2, next)

    cachedSource.get([['byId', 0, ['age', 'name']]]).subscribe(function () {
      t.ok(true, 'no error thrown for unmaterialized paths in cache')
      nextIfDone()
    }, function (err) {
      t.error(err, 'error thrown for unmaterialized paths in cache')
    })

    cachedSource.cacheErrors().subscribe(function (err) {
      t.equals(err.value.status, errorCodes.UNMATERIALIZED,
               'cache error thrown for unmaterialized paths in cache')
      nextIfDone()
    })
  }

  function checkUpstream () {
    // Unmaterialized paths on the upstream *are* fatal
    cachedSource.get([['byId', 0, ['name', 'occupation']]]).subscribe(function () {
      t.fail('no error thrown for unmaterialized paths in remote')
    }, function (err) {
      t.equals(err.value.status, errorCodes.UNMATERIALIZED,
               'error thrown for unmaterialized paths in remote')
    })
  }
})

test('expired values don\'t overshadow source', function (t) {
  t.plan(2)
  var expiration = Date.now() + 100
  var cache = datasource({byId: {0: {name: $atom('Bobob', {
    $expires: expiration
  })}}})
  var source = datasource({byId: {0: {name: 'Bobob Jr'}}})
  var cachedSource = new HierarchicalDataSource(cache, source)
  var pathSets = [['byId', 0, 'name']]

  reqInitial(reqAfterExpired(assertUnique))

  function reqInitial (next) {
    cachedSource.get(pathSets).subscribe(function (envelope) {
      var value = get(envelope.jsonGraph, pathSets[0])
      callAfter(expiration, next(value))
    }, error)
  }

  function reqAfterExpired (next) {
    return function (initialValue) {
      return function () {
        cachedSource.get(pathSets).subscribe(function (envelope) {
          var currentValue = get(envelope.jsonGraph, pathSets[0])
          next(initialValue, currentValue)
        }, error)
      }
    }
  }

  function assertUnique (initialValue, currentValue) {
    t.equal(expandValues(initialValue),
      'Bobob', 'initial request yields cached value')
    t.equal(expandValues(currentValue),
      'Bobob Jr', 'delayed request yields source value')
  }

  function error (err) {
    t.error(err)
  }
})

test('cache failure does not break everything', function (t) {
  t.plan(3)
  var cache = {
    get: function () {
      return Observable.create(function (observer) {
        observer.onError(new Error('aint nobody got time fo dat'))
      })
    },
    set: function () { return Observable.create(function () {}) }
  }
  var source = datasource({byId: {0: {message: 'hello beautiful'}}})
  var cachedSource = new HierarchicalDataSource(cache, source)
  var cacheErrors = cachedSource.cacheErrors()
  var pathSets = [['byId', 0, 'message']]
  cachedSource.get(pathSets).subscribe(function (envelope) {
    var message = expandValues(get(envelope.jsonGraph, pathSets[0]))
    t.equal(message, 'hello beautiful', 'got data from source when cache failed')
  }, function (err) {
    t.error(err)
  })
  cacheErrors.subscribe(function (err) {
    t.equal(err.value.status, errorCodes.CACHE_FAIL, 'cache failure message emitted')
    t.equal(err.value.detail, 'aint nobody got time fo dat')
  })
})

test('source failure throws an error', function (t) {
  t.plan(2)
  var cache = datasource({byId: {0: {message: 'meh'}}})
  var source = {
    get: function () {
      return Observable.create(function (observer) {
        observer.onError(new Error('no'))
      })
    }
  }
  var cachedSource = new HierarchicalDataSource(cache, source)
  cachedSource.get([['byId', 1, 'message']]).subscribe(function () {
    t.fail('expected data source to throw error')
  }, function (err) {
    t.equal(err.value.status, errorCodes.SOURCE_FAIL,
            'source failure throws error')
    t.equal(err.value.detail, 'no')
  })
})

test('stale cache updates after upstream fetch', function (t) {
  t.plan(3)
  var expiration = Date.now() + 100
  var cache = datasource({byId: {0: {name: 'Sean',
    age: $atom(26, {$expires: expiration})}}})
  var source = datasource({byId: {0: {name: 'Julie',
    age: 27}}})
  var unmaterialized = datasource({})
  var cachedSource = new HierarchicalDataSource(cache, source)
  var cacheOnly = new HierarchicalDataSource(cache, unmaterialized)
  var pathSets = [['byId', 0, ['name', 'age']]]

  fetchCached(missAndFetchUpstream(ensureCacheUpdated))

  function fetchCached (next) {
    cacheOnly.get(pathSets).subscribe(function (envelope) {
      var value = expandValues(get(envelope.jsonGraph, ['byId', 0]))
      t.deepEqual(value, {name: 'Sean', age: 26},
        'get without upstream source returns expiring value')
      callAfter(expiration, next)
    }, function (err) {
      t.error(err)
    })
  }

  function missAndFetchUpstream (next) {
    return function () {
      cachedSource.get(pathSets).subscribe(function (envelope) {
        var value = expandValues(get(envelope.jsonGraph, ['byId', 0]))
        t.deepEqual(value, {name: 'Sean', age: 27},
          'get with upstream source returns current values')
        setTimeout(next, 0)
      }, function (err) {
        t.error(err)
      })
    }
  }

  function ensureCacheUpdated () {
    cacheOnly.get(pathSets).subscribe(function (envelope) {
      var value = expandValues(get(envelope.jsonGraph, ['byId', 0]))
      t.deepEqual(value, {name: 'Sean', age: 27},
        'local cache has been updated automatically')
    }, function (err) {
      t.error(err)
    })
  }
})

function datasource (cache) {
  return new falcor.Model({
    cache: cache
  }).asDataSource()
}
