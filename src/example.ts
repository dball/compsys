import { Actor, Blueprint, Component, Config } from '.';

class MandrillEmailer implements Actor {
  private key: string;
  private db: Actor;

  constructor(key: string) {
    this.key = key;
  }

  async start() {
    return this;
  }

  async stop() {
    return this;
  }

  setDependency(role: string, component: Component) {
    if (role === 'db') {
      this.db = component;
    }
    return this;
  }
}

const buildMandrillEmailer = (config: Config) => new MandrillEmailer(config.mandrill.key);

/*
const blueprint: Blueprint = {
  roles: {
    email: 'Sends emails',
    slack: 'Sends slacks',
    db: 'Stores data',
    users: 'Manages users'
  },
  actors: {
    email: [buildMandrillEmailer, ['db']],
    db: [{}],
  }
};
*/
