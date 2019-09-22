import { Actor, buildSystem, Component, Config, Role } from 'compsys';

const defaultConfig = {
  web: {
    port: 8888,
    scheme: 'http',
  },
  db: {
    type: 'file',
    path: 'data',
  }
};

const buildSystemClock = () => ({ now: () => new Date(), });

class WebServer implements Actor {
  private port: number;
  private scheme: 'http' | 'https';
  private db: any;
  private clock: any;

  constructor(config: Config) {
    // TODO construct
  }

  async start() {
    // TODO actually start
    return this;
  }

  async stop() {
    // TODO actually stop
    return this;
  }

  setDependency(role: Role, component: Component) {
    this[role] = component;
    return this;
  }
}

const buildWebServer = (config: Config) => new WebServer(config);

const sensibleDefaultBlueprint = {
  roles: {
    clock: 'Observes the current time',
    db: 'Manages persistent structured data',
    fs: 'Manages persistent files',
    web: 'Handles incoming requests'
  },
  producers: {
    clock: { producer: buildSystemClock },
    web: { producer: buildWebServer, dependencies: ['clock', 'db'] },
  },
};