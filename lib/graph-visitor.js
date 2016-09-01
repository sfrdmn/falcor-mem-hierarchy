var util = require('falcor-path-utils')
var iterateKeySet = util.iterateKeySet

function visit (pathSets, graph, fn) {
  pathSets.forEach(function (pathSet) {
    dive(pathSet, 0, graph, [])
  })

  function dive (pathSet, depth, currNode, currPath) {
    if (!pathSet || !pathSet.length || pathSet[depth] === void 0) {
      return
    }
    var it = {}
    var keySet = pathSet[depth]
    var nextDepth = depth + 1
    var leaf = nextDepth === pathSet.length
    var key = iterateKeySet(keySet, it)
    currNode = currNode === void 0 ? empty : currNode

    do {
      currPath.push(key)
      if (leaf) {
        // Call visitor fn, making sure to copy path array
        fn(from(currPath), currNode[key])
      } else {
        dive(pathSet, nextDepth, currNode[key], currPath)
      }
      currPath.pop()
    } while (!it.done && (key = iterateKeySet(keySet, it)))
  }
}

function reduce (pathSets, graph, fn, acc) {
  visit(pathSets, graph, function (path, value) {
    acc = fn(acc, path, value)
  })
  return acc
}

/*
function map (pathSets, graph, fn) {
  var result = {}
  visit(pathSets, graph, function (path, value) {
    set(result, path, value)
  })
  return result
}
*/

var from = Array.from ? Array.from : function (arrayIsh) {
  return Array.prototype.slice.call(arrayIsh)
}

var empty = {}

module.exports = {
  visit: visit,
  reduce: reduce
}
