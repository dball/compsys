import * as sys from 'compsys';
import * as fs from 'fs';
import * as im from 'immutable';
import * as http from 'http';
import edn = require('jsedn');

// Compsys suggests expressing all side effects and other impure calls within
// components. This being typescript, we can go further and provide types for
// the components' interfaces.

// In a real system, complex implementations probably would want to be
// in modules of their own, if only to limit the requires in this module.

// Also, in a real system, dependencies with big apis that are extensively used
// aren't worth abstracting, generally. You probably don't want to write a
// custom interface for a e.g. sql server if you're really using relational
// algebra and explicit transactions.

// But yes, really, we do want an interface wrapper for the system clock. Tests
// that want to say things about the system behavior over at least the time it
// observed via this interface in any way will thank you with their determinism
// and their test literal values emitted from your mock impl.
interface Clock {
  now(): Date;
}

// Yes, really, an interface for the Filesystem. Filesystem interfaces are
// gigantic but we generally only use a handful of fns in our applications so
// writing a wrapper interface tends to be easy and also provide a handy central
// place for decisions like charset encoding and error handling. Also, since the
// interface is tailored to our needs, we can often reduce the incidental
// complexity in our using code.
interface Filesystem {
  readdir(path: string): Promise<Array<string>>;
  readfile(path: string): Promise<string>;
}

class RealFilesystem implements Filesystem {
  readdir(path: string): Promise<Array<string>> {
    return new Promise((resolve, reject) =>
      fs.readdir(path, (err, files) => !err ? resolve(files.map((file) => `${path}/${file}`)) : reject(err)));
  }

  readfile(path: string): Promise<string> {
    return new Promise((resolve, reject) =>
      fs.readFile(path, (err, data) => !err ? resolve(data.toString()) : reject(err)));
  }
}

// It's not much a database, really.
interface Database<T> {
  list(): Promise<Array<T>>;
}

// We'll implement it against a directory of edn files. Edn is a pure data
// serialization format similar to JSON but has a richer set of builtin types
// (including dates, notably) and a simple extension system for custom type
// literals which need not be coordinated.
//
// Note the database uses a filesystem, which will be provided by the system
// on start using the inject instance method of the base sys.Actor class.
class EdnFileDatabase<T> extends sys.Actor implements Database<T> {
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
    const ednFilenames = filenames.filter((filename) => filename.match(/\.edn$/));
    const ednFiles = await Promise.all(ednFilenames.map(this.fs.readfile));
    const contents = ednFiles.map(data => edn.toJS(edn.parse(data)));
    return this.guard ? contents.filter(this.guard) : contents;
  }
}

interface Article {
  id: string,
  created_at: Date,
  title: string,
  body: string
}

// Sure would be cool if Typescript could generate type guards, or if types
// existed at runtime so we could do it.
const isArticle = (article: any): article is Article =>
  typeof article === 'object' && article.id && article.created_at && article.title && article.body;

// The web server component doesn't have an interface since it provides no internal api.
// It does have a lifecycle though, expressed in our start and stop method impls.
class WebServer extends sys.Actor {
  private port: number;
  private scheme: 'http';
  private db: Database<Article>;
  private clock: Clock;
  private server: http.Server;

  constructor(port: number, scheme: 'http') {
    super();
    this.port = port;
    this.scheme = scheme;
    const handleRequest: http.RequestListener = async (req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.write(JSON.stringify(await this.db.list()));
      res.end();
    };
    this.server = http.createServer(handleRequest);
  }

  [sys.start](): Promise<this> {
    return new Promise((resolve, reject) =>
      this.server.listen({ port: this.port }, () => resolve(this)));
  }

  [sys.stop](): Promise<this> {
    return new Promise((resolve, reject) =>
      this.server.close((err) => !err ? resolve(this) : reject(err)));
  }
}

// We'll declare the default config in an immutable map. These are easy to
// merge, reach deeply into, and are pretty great for configs since every
// referent is guaranteed to have values that won't change out from under them
// unexpectedly.
const defaultConfig = im.fromJS({
  web: {
    port: 8888,
    scheme: 'http',
  },
  db: {
    path: 'data',
  }
});

// The core system is likely to be the same regardless of what kind of db and fs we use
// so we'll declare a partial blueprint builder
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

// And here we'll build a local system that uses the simple filesystem and edn database
export const buildLocalSystem = (config: any) => {
  const localConfig = defaultConfig.mergeDeep(im.fromJS(config));
  const localBlueprint = im.fromJS({
    components: {
      fs: {
        component: new RealFilesystem(),
      },
      db: {
        component: new EdnFileDatabase<Article>(localConfig.getIn(['db', 'path']), isArticle),
        dependencies: ['clock', 'fs'],
      },
    }
  });
  const blueprint = buildDefaultBlueprint(localConfig).mergeDeep(localBlueprint);
  return sys.buildSystem(blueprint.toJS());
};

// We could provide a test impl whose e.g. db was a mutable data structure for
// fast system tests. To the extent that our abstractions aren't leaky, these
// kind of tests are great for specifying features, though notably insufficient
// to demonstrate non-functional and safety requirements.

// When this approach is taken, gnarly interfaces, particularly when implemented
// against services that have many failure modes, should have strong integrated
// tests of their own. Often the system should also be tested with production
// implementations in ci at least periodically.