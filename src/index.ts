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
// TODO we could declare lifecycle timeouts to provide for bounded start and stop guarantees
export interface Blueprint {
  roles: Map<Role, Description>;
  components: Map<Role, { component: Component, dependencies: Set<Role> }>;
}

/**
 * Actor type guard
 * @param x
 */
const isActor = (x: any): x is Actor => {
  return typeof x === 'object' && x[start] && x[stop];
};

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
      if (!isActor(component) && dependencies.size !== 0) {
        throw new Error('Only actors may have dependencies');
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
      if (isActor(component)) {
        let actor = component as Actor;
        for (const dependency of dependencies) {
          actor = actor[inject](dependency, this.components.getNodeData(dependency));
        }
        // TODO as a performance optimization, we could organize the graph into levels
        // and await all of each level's components simultaneously
        actor = await component[start]();
        // The actor may now be a new instance, so we'll replace the original
        // Note we could reasonably store the original, in case we are in the immutable
        // case and we would like to reset even if something goes wrong in start or stop
        // but it's not worth doing unless it's worth doing
        this.components.setNodeData(role, actor);
      }
    }
    return this;
  }

  // TODO catch errors and shutdown as gracefully as possible
  // TODO enforce timeout on the awaits
  async [stop]() {
    for (const role of this.components.overallOrder().reverse()) {
      const component = this.components.getNodeData(role);
      if (isActor(component)) {
        // TODO a similar performance optimization as above is possible
        let actor = component as Actor;
        actor = await actor[stop]();
        // We could clear the dependencies now for symmetry and to free resources, but
        // it would cost time and would impede debugging, so we'll let them hang out
        // in the system instance
        this.components.setNodeData(role, actor);
      }
    }
    return this;
  }
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

export const startSystem = async (system: System) => system[start]();
export const stopSystem = async (system: System) => system[stop]();