import { Actor, BaseActor, buildSystem, Component, Config, Role } from 'compsys';
import * as fs from 'fs';

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

interface Clock {
  now(): Date;
}

const buildSystemClock: () => Clock = () => ({ now: () => new Date(), });

interface Filesystem {
  readdir(path: string): Promise<Array<string>>;
  readfile(path: string): Promise<string>;
}

class RealFilesystem implements Filesystem {
  readdir(path: string): Promise<Array<string>> {
    return new Promise((resolve, reject) =>
      fs.readdir(path, (err, files) => !err ? resolve(files) : reject(err)));
  }

  readfile(path: string): Promise<string> {
    return new Promise((resolve, reject) =>
      fs.readFile(path, (err, data) => !err ? resolve(data.toString()) : reject(err)));
  }
}

const buildRealFilesystem = () => new RealFilesystem;

interface Database<T> {
  list(): Promise<Array<T>>;
}

class JsonFileDatabase<T> extends BaseActor implements Database<T> {
  private dir: string;
  private guard: (x: any) => x is T;
  private fs: Filesystem;

  constructor(dir: string, guard: (x: any) => x is T) {
    super();
    this.dir = dir;
    this.guard = guard;
  }

  async list(): Promise<Array<T>> {
    const filenames = await this.fs.readdir(this.dir);
    const jsonFilenames = filenames.filter((filename) => filename.match(/\.json$/));
    const jsonFiles = await Promise.all(jsonFilenames.map(this.fs.readfile));
    const contents = jsonFiles.map(data => JSON.parse(data));
    if (this.guard) {
      return contents.filter(this.guard);
    } else {
      // TODO why don't we need to assert this type as Array<T> ?
      return contents;
    }
  }
}

interface Article {
  id: string,
  title: string,
  body: string
}

const isArticle = (article: any): article is Article =>
  typeof article == 'object' && article.id && article.title && article.body;

class WebServer extends BaseActor {
  private port: number;
  private scheme: 'http' | 'https';
  private db: any;
  private clock: any;

  constructor(config: Config) {
    super();
    this.port = config.getIn(['web', 'port']);
    this.scheme = config.getIn(['web', 'scheme']);
  }

  // TODO lifecycle
}

const buildWebServer = (config: Config) => new WebServer(config);

const sensibleDefaultBlueprint = {
  roles: {
    clock: 'Observes the current time',
    db: 'Manages persistent structured data',
    fs: 'Manages persistent files',
    web: 'Handles incoming requests',
  },
  producers: {
    clock: { producer: buildSystemClock },
    web: { producer: buildWebServer, dependencies: ['clock', 'db'] },
  },
};

const buildLocalSystem = (config: Config) => {
  const blueprint = { ...sensibleDefaultBlueprint };
  blueprint.producers['fs'] = { producer: buildRealFilesystem };
  blueprint.producers['db'] = {
    producer: () => new JsonFileDatabase<Article>('data', isArticle),
    dependencies: ['fs']
  };
  return buildSystem(blueprint, config);
};