import * as sys from 'compsys';
import * as fs from 'fs';
import * as im from 'immutable';
import * as http from 'http';

interface Clock {
  now(): Date;
}

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

interface Database<T> {
  list(): Promise<Array<T>>;
}

class JsonFileDatabase<T> extends sys.BaseActor implements Database<T> {
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
    return this.guard ? contents.filter(this.guard) : contents;
  }
}

interface Article {
  id: string,
  title: string,
  body: string
}

const isArticle = (article: any): article is Article =>
  typeof article === 'object' && article.id && article.title && article.body;

class WebServer extends sys.BaseActor {
  private port: number;
  private scheme: 'http' | 'https';
  private db: any;
  private clock: any;

  constructor(port: number, scheme: 'http' | 'https') {
    super();
    this.port = port;
    this.scheme = scheme;
  }

  // TODO lifecycle
}

const defaultConfig = im.fromJS({
  web: {
    port: 8888,
    scheme: 'http',
  },
  db: {
    path: 'data',
  }
});

const buildDefaultBlueprint = (config: any) => im.fromJS({
  roles: {
    clock: 'Observes the current time',
    db: 'Manages persistent structured data',
    fs: 'Manages persistent files',
    web: 'Handles incoming requests',
  },
  components: {
    clock: {
      component: { now: () => new Date() },
    },
    web: {
      component: new WebServer(config.getIn(['web', 'port']), config.getIn(['web', 'scheme'])),
      dependencies: ['clock', 'db'],
    },
  },
});

export const buildLocalSystem = (config: any) => {
  const localConfig = defaultConfig.mergeDeep(im.fromJS(config));
  const localBlueprint = im.fromJS({
    components: {
      fs: {
        component: new RealFilesystem(),
      },
      db: {
        component: new JsonFileDatabase<Article>(localConfig.getIn(['db', 'path']), isArticle),
        dependencies: ['clock', 'fs'],
      },
    }
  });
  const blueprint = buildDefaultBlueprint(localConfig).mergeDeep(localBlueprint);
  return sys.buildSystem(blueprint.toJS());
};