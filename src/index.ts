import { DepGraph } from 'dependency-graph';

/**
 * Objects with a start property can be started
 */
export const start = Symbol('start');
/**
 * Objects with a stop property can be stopped
 */
export const stop = Symbol('stop');
/**
 * Objects with an inject property can accept dependencies by role
 */
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
 * An Depender is a Component that has dependencies
 */
export interface Depender {
  [inject](role: Role, component: Component): Depender;
}

/**
 * The Actor class implements a Depender that stores components in mutable
 * fields.
 */
export class Actor implements Depender {
  [inject](role: Role, component: Component) {
    this[role] = component;
    return this;
  }
}

/**
 * A Blueprint describes the composition of a system
 */
// TODO we could declare lifecycle timeouts to provide for bounded start and stop guarantees
export interface Blueprint {
  roles: Map<Role, Description>;
  components: Map<Role, { component: Component, dependencies: Set<Role> }>;
}

/**
 * Depender type guard
 * @param x
 */
const isDepender = (x: any): x is Depender => {
  return typeof x === 'object' && x[inject];
};

/**
 * Lifecycle type guard
 * @param x
 */
const hasLifecycle = <T>(x: any): x is Lifecycle<T> => {
  return typeof x === 'object' && x[start] && x[stop];
}

/**
 * A System is a graph of components that can depend on each other and be
 * started and stopped
 */
export class System implements Lifecycle<System> {
  private components: DepGraph<Component>;

  constructor(blueprint: Blueprint) {
    this.components = new DepGraph<Component>();
    [...blueprint.roles.keys()].forEach(role => this.components.addNode(role));
    blueprint.components.forEach(({ component, dependencies }, role) => {
      if (!isDepender(component) && dependencies.size !== 0) {
        throw new Error('Only dependers may have dependencies');
      }
      this.components.setNodeData(role, component);
      dependencies.forEach(dependency => this.components.addDependency(role, dependency));
    });
    const declaredRoles = Array.from(blueprint.roles.keys());
    const missingRoles = declaredRoles.filter((role) => !this.components.hasNode(role));
    if (missingRoles.length > 0) {
      throw new Error('System blueprint contains missing roles: ' + missingRoles);
    }
  }

  // TODO catch errors and attempt to shutdown partial system gracefully
  // TODO enforce timeout on the awaits
  async [start]() {
    for (const role of this.components.overallOrder()) {
      const component = this.components.getNodeData(role);
      const dependencies = this.components.dependenciesOf(role);
      if (isDepender(component)) {
        let depender = component as Depender;
        for (const dependency of dependencies) {
          depender = depender[inject](dependency, this.components.getNodeData(dependency));
        }
      }
      if (hasLifecycle(component)) {
        // TODO as a performance optimization, we could organize the graph into levels
        // and await all of each level's components simultaneously
        //
        // The component may now be a new instance, so we'll replace the original
        // Note we could reasonably store the original, in case we are in the immutable
        // case and we would like to reset even if something goes wrong in start or stop
        // but it's not worth doing unless it's worth doing
        this.components.setNodeData(role, await component[start]());
      }
    }
    return this;
  }

  // TODO catch errors and shutdown as gracefully as possible
  // TODO enforce timeout on the awaits
  async [stop]() {
    for (const role of this.components.overallOrder().reverse()) {
      const component = this.components.getNodeData(role);
      if (hasLifecycle(component)) {
        // TODO a similar performance optimization as above is possible
        //
        // We could clear the dependencies now for symmetry and to free resources, but
        // it would cost time and would impede debugging, so we'll let them hang out
        // in the system instance
        this.components.setNodeData(role, await component[stop]());
      }
    }
    return this;
  }

  // Since we own this class, we can freely use the sensibly expected field names
  async start() { return this[start](); }
  async stop() { return this[stop](); }

}

export const buildSystem = (blueprint: any) => {
  const myBlueprint: Blueprint = {
    roles: new Map(Object.entries(blueprint.roles)),
    components: new Map(Object.entries(blueprint.components).map((entry: any) => {
      const [role, { component, dependencies }] = entry;
      return [role, { component: component, dependencies: new Set(dependencies) }]
    }))
  };
  return new System(myBlueprint);
};