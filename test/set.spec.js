var test = require('tape')
var falcor = require('falcor')
var Observable = require('rx').Observable

var expandValues = require('./util/expand-values')
var stripModelMeta = require('./util/strip-model-meta')
var after = require('./util/after')

var MemHierarchyDataSource = require('..')
var errorCodes = MemHierarchyDataSource.errorCodes

test('set operations give expected response', function (t) {
  t.plan(1)
  var tieredSource = reconciled({byId: {0: {mood: 'great'}}})
  var pathSets = [['byId', 0, 'mood']]
  var expected = {byId: {0: {mood: 'absolutely terrible'}}}
  var error = errorHandler(t)

  tieredSource.set({
    paths: pathSets,
    jsonGraph: expected
  }).subscribe(function (envelope) {
    t.deepEqual(expandValues(envelope), {
      paths: pathSets,
      jsonGraph: expected
    }, 'set response is sane')
  }, error)
})

test('model integration is sane for sets', function (t) {
  t.plan(1)
  var tieredSource = reconciled({byId: {0: {catchPhrase: 'well ain\'t that a pickle!'}}})
  var model = new falcor.Model({
    source: tieredSource
  })
  var expected = {byId: {0: {catchPhrase: 'helllo sally!'}}}
  var error = errorHandler(t)

  model.set({
    path: ['byId', 0, 'catchPhrase'],
    value: 'helllo sally!'
  }).subscribe(function (jsonEnvelope) {
    t.deepEqual(stripModelMeta(jsonEnvelope.json), expected,
    'model set operation works as expected')
  }, error)
})

test('set operations update both the cache and the remote', function (t) {
  t.plan(2)
  var initialData = {byId: {0: {name: 'Sean Fridman'}}}
  var cache = datasource(initialData)
  var source = datasource(initialData)
  var tieredSource = new MemHierarchyDataSource(cache, source)
  var error = errorHandler(t)
  var expected = {
    byId: {0: {name: 'Sean "The Crusher" Fridman'}}
  }

  setName(assertNameWasSet)

  function setName (next) {
    tieredSource.set({
      paths: [['byId', 0, 'name']],
      jsonGraph: expected
    }).subscribe(function (result) {
      next()
    }, error)
  }

  function assertNameWasSet () {
    var pathSets = [['byId', 0, 'name']]
    cache.get(pathSets).subscribe(assert, error)
    source.get(pathSets).subscribe(assert, error)

    function assert (envelope) {
      t.deepEqual(expandValues(envelope.jsonGraph), expected,
        'get yields the data which was set')
    }
  }
})

test('set operations are transactional when the failure point is upstream', function (t) {
  t.plan(2)
  var pathSets = [['byId', 0, 'gender']]
  var expected = {byId: {0: {gender: 'how dare u'}}}
  var cache = datasource(expected)
  var source = {
    set: function () {
      return Observable.create(function (observer) {
        observer.onError(new Error('aw hell naw'))
      })
    }
  }
  var tieredSource = new MemHierarchyDataSource(cache, source)
  var error = errorHandler(t)

  setData(assertExpected)

  function setData (next) {
    tieredSource.set({
      paths: pathSets,
      jsonGraph: {byId: {0: {gender: 'male'}}}
    }).subscribe(function () {
      t.fail('set operation on faulty upstream should have errored')
    }, function (err) {
      t.equal(err.value.status, errorCodes.SOURCE_FAIL,
        'set on faulty upstream emitted error')
      next()
    })
  }

  function assertExpected () {
    cache.get(pathSets).subscribe(function (envelope) {
      t.deepEqual(expandValues(envelope.jsonGraph), expected,
        'set on faulty upstream not executed on cache')
    }, error)
  }
})

test('set on faulty cache still goes through to upstream', function (t) {
  t.plan(2)
  var pathSets = [['byId', 0, 'money']]
  var expected = {byId: {0: {money: 'so much money'}}}
  var cache = {
    set: function () {
      return Observable.create(function (observer) {
        observer.onError(new Error('blargh'))
      })
    },
    get: function () {
      return Observable.create(function (observer) {
        observer.onError(new Error('nothin to see here'))
      })
    }
  }
  var source = datasource(expected)
  var tieredSource = new MemHierarchyDataSource(cache, source)
  var error = errorHandler(t)

  setData(assertExpected)

  function setData (next) {
    var nextIfDone = after(2, next)

    var sub = tieredSource.cacheErrors().subscribe(function (err) {
      t.equal(err.value.status, errorCodes.CACHE_FAIL,
              'cache emitted error')
      sub.dispose()
      nextIfDone()
    }, error)

    tieredSource.set({
      paths: pathSets,
      jsonGraph: expected
    }).subscribe(function (envelope) {
      nextIfDone()
    }, error)
  }

  function assertExpected () {
    tieredSource.get(pathSets).subscribe(function (envelope) {
      t.deepEqual(expandValues(envelope.jsonGraph), expected,
        'set on faulty cache went through to upstream')
    }, error)
  }
})

function reconciled (data) {
  return new MemHierarchyDataSource(
    datasource(data), datasource(data))
}

function datasource (cache) {
  return new falcor.Model({
    cache: cache
  }).asDataSource()
}

function errorHandler (t) {
  return function (err) {
    t.error(err)
  }
}
