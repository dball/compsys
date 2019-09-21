# Compsys

Compsys is a Typescript system architecture framework library. It is heavily
inspired by Stuart Sierra's component library for Clojure.

## Design Goals

* Provide a principled approach to system architecture
* Facilitate encapsulating side effects within coherent substitutable components
* Separate and simplify the stages of an application's lifecycle
* Allow, but not mandate, immutable components
* Components play one or more named roles, and depend on any number of other
  named roles
* Components may or may not have lifecycles
* Components may or may not have dependencies
* Use of the library should be able to be as idiomatic Javascript as possible,
  using normal mutable objects
* The library should have as few dependencies as possible

## Components

Components may be of any Javascript type. Components are declared to play named
roles within a system. Components are constructed by Producers, which are simply
functions that accept the system's Config and return a component.

Components may have dependencies and lifecycles; such components are called
actors and must implement the Actor interface to accept dependencies and receive
lifecycle events. Dependencies are declared to roles.

Actors are started when the system starts, in the order implied by the
dependency graph. Before actors with dependencies are started, they are supplied
with instances of their dependencies. If those dependencies are actors, they're
guaranteed to have been started.

Similarly, actors are stopped with the system stops in reverse order.