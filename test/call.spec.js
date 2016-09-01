var test = require('tape')
var falcor = require('falcor')
var Router = require('falcor-router')
var $ref = require('falcor-json-graph').ref
var Observable = require('rx').Observable

var expandValues = require('./util/expand-values')
var stripMeta = require('./util/strip-model-meta')

var HierarchicalDataSource = require('..')
var errorCodes = HierarchicalDataSource.errorCodes

test('call response is sane', function (t) {
  t.plan(1)
  var sources = sourcePair()
  var cache = sources[0]
  var source = sources[1]
  var tieredSource = new HierarchicalDataSource(cache, source)
  var error = errorHandler(t)

  tieredSource.call(['chumps', 'push'], [$ref(['usersById', 3])], ['name'], ['length'])
    .subscribe(function (envelope) {
      t.deepEqual(stripMeta(expandValues(envelope)), {
        paths: [['chumps', 'length'],
                ['chumps', 1, 'name']],
        jsonGraph: {
          usersById: {3: {name: 'silly man'}},
          chumps: {
            1: $ref('usersById[3]'),
            length: 2
          }
        }
      }, 'call response is sane')
    }, error)
})

test('calls which mutate the source mutate the cache', function (t) {
  t.plan(1)
  var sources = sourcePair()
  var cache = sources[0]
  var source = sources[1]
  var tieredSource = new HierarchicalDataSource(cache, source)
  var error = errorHandler(t)

  pushRef(assertCacheUpdated)

  function pushRef (next) {
    tieredSource.call(['chumps', 'push'], [$ref('usersById[3]')],
      ['name'], ['length']).subscribe(next, error)
  }

  function assertCacheUpdated () {
    cache.get([['chumps', 1, 'name']]).subscribe(function (envelope) {
      t.deepEqual(stripMeta(expandValues(envelope.jsonGraph)), {
        usersById: {3: {name: 'silly man'}},
        chumps: {1: $ref('usersById[3]')}
      }, 'cache has new ref after push')
    }, error)
  }
})

test('upstream failure throws error', function (t) {
  t.plan(2)
  var cache = sourcePair()[0]
  var source = {
    call: function () {
      return Observable.create(function (observer) {
        observer.onError(new Error('im dead'))
      })
    }
  }
  var tieredSource = new HierarchicalDataSource(cache, source)

  tieredSource.call(['chumps', 'push'], [$ref('usersById[3]')]).subscribe(function (envelope) {
    t.fail('source failure did not throw an error')
  }, function (err) {
    t.equal(err.value.status, errorCodes.SOURCE_FAIL, 'source failure threw error')
    t.equal(err.value.detail, 'im dead')
  })
})

test('cache errors are handled robustly', function (t) {
  t.plan(3)
  var cache = {
    set: function () {
      return Observable.create(function (observer) {
        observer.onError(new Error('no way'))
      })
    }
  }
  var source = sourcePair()[1]
  var tieredSource = new HierarchicalDataSource(cache, source)
  var error = errorHandler(t)

  tieredSource.cacheErrors().subscribe(function (err) {
    t.equal(err.value.status, errorCodes.CACHE_FAIL,
            'cache failure emitted error')
    t.equal(err.value.detail, 'no way')
  })

  tieredSource.call(['chumps', 'push'], [$ref('usersById[3]')])
    .subscribe(function (envelope) {
      t.ok(true, 'call operation successful despite cache failure')
    }, error)
})

function sourcePair () {
  var data = {
    usersById: {
      0: {name: 'Sean', age: 12},
      1: {name: 'Vampire person', age: 3000},
      3: {name: 'silly man', age: 43}
    },
    chumps: [
      $ref('usersById[0]')
    ]
  }

  var cache = new falcor.Model({
    cache: data
  }).asDataSource()

  var source = new Router([{
    route: 'usersById[{integers:ids}]["name", "age"]',
    get: function (pathSet) {
      var keys = pathSet[2]
      return pathSet.ids.map(function (id) {
        var user = data.usersById[id]
        return {
          path: ['usersById', id],
          value: keys.reduce(function (acc, key) {
            acc[key] = user[key]
            return acc
          }, {})
        }
      })
    }
  }, {
    route: 'chumps.length',
    get: function () {
      return [{path: ['chumps', 'length'], value: data.chumps.length}]
    }
  }, {
    route: 'chumps.push',
    call: function (callPath, args) {
      var list = data.chumps
      list.push.apply(list, args)
      var length = data.chumps.length
      var added = args.length
      return args.map(function (ref, i) {
        var index = length - added + i
        return {path: ['chumps', index], value: ref}
      })
    }
  }])
  return [cache, source]
}

function errorHandler (t) {
  return function (err) {
    t.error(err)
  }
}
