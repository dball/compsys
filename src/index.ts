import { DepGraph } from 'dependency-graph';

/**
 * A Config is a value that describes how a component behaves
 */
export type Config = any;

export const start = Symbol('start');
export const stop = Symbol('stop');
export const inject = Symbol('inject');

/**
 * Objects with Lifecycles can be started and stopped asynchronously
 * and return promises of themselves to allow for immutable instances
 */
interface Lifecycle<T> {
  [start](): Promise<T>;
  [stop](): Promise<T>;
}

/**
 * A Role describes the part a component plays within a system
 */
type Role = string;

/**
 * A Description documents the purpose of a role
 */
type Description = string;

/**
 * A Component is a piece of a system that plays a role
 */
type Component = any;

/**
 * A Producer constructs a Component from a Config value
 */
type Producer = (config: Config) => Component;

/**
 * An Actor is a Component that has a Lifecycle and dependencies
 */
export interface Actor extends Lifecycle<Actor> {
  [inject](role: Role, component: Component): Actor;
}

/**
 * The BaseActor class provides an Actor implementation that has no
 * start or stop activity and sets dependencies as mutable properties.
 */
export class BaseActor implements Actor {
  async [start]() {
    return this;
  }

  async [stop]() {
    return this;
  }

  [inject](role: Role, component: Component) {
    this[role] = component;
    return this;
  }
}

/**
 * A Blueprint describes the composition of a system
 */
export interface Blueprint {
  roles: Map<Role, Description>;
  producers: Map<Role, { producer: Producer, dependencies: Set<Role> }>;
}

const isActor = (x: any): x is Actor => {
  // TODO this isn't really strong enough. Maybe symbols would work?
  return typeof x === 'object' && x.start && x.stop;
};

// MARK

/**
 * A System is a graph of components that can depend on each other and be
 * started and stopped
 */
export class System implements Lifecycle<System> {
  private producers: DepGraph<Producer>;
  private components: Map<Role, Component> | null;
  private config: Config;

  constructor(blueprint: Blueprint, config: Config) {
    this.producers = new DepGraph();
    this.config = config;
    blueprint.producers.forEach(([producer, dependencies], role) => {
      this.producers.addNode(role, producer);
      dependencies.forEach(dependency => this.producers.addDependency(role, dependency));
    });
    const declaredRoles = Array.from(blueprint.roles.keys());
    const missingRoles = declaredRoles.filter((role) => !this.producers.hasNode(role));
    if (missingRoles.length > 0) {
      throw new Error('System blueprint contains missing roles: ' + missingRoles);
    }
  }

  // TODO catch errors and attempt to shutdown partial system gracefully
  // TODO enforce timeout on the awaits?
  async start() {
    this.components = immutable.Map<Role, Component>();
    for (const role of this.producers.overallOrder()) {
      const producer = this.producers.getNodeData(role);
      const dependencies = this.producers.dependenciesOf(role);
      let component = typeof producer === 'function' ? producer(this.config) : producer;
      if (isActor(component)) {
        for (const dependency of dependencies) {
          component = component.setDependency(dependency, this.components.get(dependency));
        }
        // TODO as a performance optimization, we could organize the graph into levels
        // and await all of each level's components simultaneously
        component = await component.start();
      } else {
        if (dependencies.length > 0) {
          throw new Error('Only actors may have dependencies');
        }
      }
      this.setDependency(role, component);
    }
    return this;
  }

  // TODO catch errors and shutdown as gracefully as possible
  // TODO enforce timeout on the awaits?
  async stop() {
    for (const role of this.producers.overallOrder().reverse()) {
      const component = this.components.get(role);
      if (isActor(component)) {
        // TODO a similar performance optimization as above is possible
        await component.stop();
      }
    }
    this.components = null;
    return this;
  }

  setDependency(role: string, component: Component) {
    this.components = this.components.set(role, component);
    return this;
  }
}

export const buildSystem = (blueprint: any, config: any) => {
  const myBlueprint = {
    roles: immutable.fromJS(blueprint.roles),
    producers: immutable.fromJS(blueprint.producers.filter)
  };
  const myConfig = immutable.fromJS(config);
  return new System(myBlueprint, myConfig);
};