module.exports = function expandValues (graph) {
  if (!graph) return
  var $type = graph && graph.$type
  if ($type === 'atom' || $type === 'error') {
    return graph.value
  } else {
    return Object.keys(graph).reduce(function (graph, key) {
      if (typeof graph[key] === 'object') {
        graph[key] = expandValues(graph[key])
      }
      return graph
    }, graph)
  }
}
