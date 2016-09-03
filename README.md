# EXPERIMENTAL

Chain Falcor DataSources together into a memory hierarchy

This allows you to create multiple caches on the way to a
DataSource. The most obvious use case is probably for having
a file system cache on the client sitting between the Model
and the server.

This is better than explicitly serializing and persisting your
Model cache:

+ It’s works incrementally
  - You don’t have to serialize the cache all at once, or calculate
    diffs
+ It’s orthogonal to normal Falcor execution
  - You don’t have to do anything! Just run gets and sets on JSON Graph
    and you’ll automatically get persistence as a side-effect of whatever
    caching properties your graph specifies

# TODO

Implement cache invalidation for ‘call‘ operations
