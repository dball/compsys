# Compsys

Compsys is a Typescript system architecture framework library. It is heavily
inspired by [Stuart Sierra's component library for Clojure](https://github.com/stuartsierra/component).

## Components

A System is a javascript object constructed from a blueprint declaring and
describing the named component roles, instances, and their dependencies.
Components may be of any type.

Components may have dependencies. Dependencies are declared on roles and are
injected when the system is started. These components must have a property for
the module's `inject` symbol whose value is a function accepting the role and
instance for each dependency. Component injection occurs at system start.

Components may have lifecycles. These are started when the system starts, in the
order required by the dependency graph, and stopped with the system stops, in
reverse order. Injected components with lifecycles are always injected after
being started. Components with lifecycles are replaced by their promised started
or stopped values, allowing for immutable components. Components with lifecycles
must have properties for the module's `start` and `stop` symbols, whose values
are async functions of no arguments which must return the component in its new
state.

## Motivation

Most of the Javascript applications I've seen seem to suffer from a lack of
architecture. The applications lack any encapsulation of and separation between
phases of the application's existence, which leads to confused code paths,
redundant code, ill-specified behaviors, bugs, etc.

Moreover, side effects tend occur all over the place, both internal and
external, which complicates testing, reduces the possibility of code reuse, and
impedes analysis.

Most applications can profitably be characterized by the following phases:

1. Constructing configuration data from various sources, including the
   filesystem, envirionment variables, command-line arguments, inspecting the
   environment, calling services, etc.
2. Validating the syntax of the configuration - not does the password work, but
   is it a non-empty string
3. Constructing a system of components that have well-defined interfaces behind
   which all side effects occur
4. Starting the system, at which point expensive resources are allocated,
   network connections are established, ports are bound for listening, etc.
5. Stopping the system, affording components the explicit opportunity to finish
   work and clean up resources

This library intends to faciliate clarifying and correctly implementing the last
three steps.

## Design Goals

* Provide a principled approach to system architecture
* Facilitate encapsulating side effects within coherent substitutable components
* Separate and simplify the stages of an application's lifecycle
* Allow, but not mandate, immutable components
* Components play named roles, and depend on any number of other named roles
* Components may or may not have lifecycles
* Components may or may not have dependencies
* Use of the library should be able to write idiomatic Javascript using normal
  mutable objects and method signatures
* The library should have as few dependencies as possible

## License

MIT

## Copyright

Copyright Donald A. Ball Jr. 2019