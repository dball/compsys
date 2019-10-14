import * as im from 'immutable';
import * as sys from 'compsys';

/**
 * Message bus
 */
type Topic = {
  id: Symbol,
  type: unknown
};

type TopicType<T extends Topic, S extends T['id']> = Extract<T, { id: S }>['type'];

interface MessageBus<T extends Topic> {
  publish<S extends T['id']>(
    topic: S,
    message: TopicType<T, S>
  ): Promise<boolean>,
  subscribe<S extends T['id']>(
    topic: S,
    consumer: (message: TopicType<T, S>) => Promise<boolean>
  ): Promise<boolean>,
  unsubscribe<S extends T['id']>(
    topic: S,
    consumer: (message: TopicType<T, S>) => Promise<boolean>
  ): Promise<boolean>
}

export class TransientMessageBus<T extends Topic> implements MessageBus<T> {
  private subscriptions: im.Map<Symbol, im.OrderedSet<(message: any) => Promise<any>>>;

  async publish<S extends T['id']>(
    topic: S,
    message: TopicType<T, S>
  ): Promise<boolean> {
    const consumers = this.subscriptions.get(topic);
    const notifications = consumers.map((consume) => consume(message));
    await Promise.all(notifications);
    return true;
  }

  async subscribe<S extends T['id']>(
    topic: S,
    consumer: (message: TopicType<T, S>) => Promise<boolean>
  ): Promise<boolean> {
    this.subscriptions =
      this.subscriptions.update(topic, (consumers) => (consumers || im.OrderedSet()).add(consumer));
    return true;
  }

  async unsubscribe<S extends T['id']>(
    topic: S,
    consumer: (message: TopicType<T, S>) => Promise<boolean>
  ): Promise<boolean> {
    this.subscriptions =
      this.subscriptions.update(topic, (consumers) => (consumers || im.OrderedSet()).delete(consumer));
    return true;
  }
}

/**
 * Scheduler
 */
type Time = number;
type Exercise = string;

type Schedule = im.OrderedMap<Time, Exercise>;

interface Scheduler {
  getSchedule: () => Promise<Schedule>;
}

/**
 * Speaker
 */
interface Speaker {
  say: (message: string) => Promise<boolean>;
}

/** State */
type State = im.Record<{
  schedule: Schedule,
  time: Time
}>;

const clockTicks = Symbol('clock');

type ClockTickTopic = {
  id: typeof clockTicks,
  type: number
};

class IntervalStopwatch extends sys.Actor {
  private ms: number;
  private timeout: any;
  private messenger: MessageBus<ClockTickTopic>;
  private ticks: number;

  constructor(ms: number) {
    super();
    this.ms = ms;
    this.ticks = 0;
  }

  tick(): void {
    const ticks = this.ticks;
    this.ticks += 1;
    this.messenger.publish(clockTicks, ticks);
  }

  async [sys.start](): Promise<this> {
    this.timeout = setInterval(this.tick, this.ms);
    return this;
  }

  async [sys.stop](): Promise<this> {
    clearInterval(this.timeout);
    this.timeout = null;
    return this;
  }
}

const buildSystem = () =>
  im.fromJS({
    roles: {
      executor: 'Executes the effects of various events',
      messenger: 'Delivers messages',
      scheduler: 'Renders the exercise schedule',
      speaker: 'Utters messages',
      stopwatch: 'Reports the time at regular intervals',
    },
    components: {
      executor: {
        component: {},
        dependencies: ['messenger', 'scheduler', 'speaker', 'stopwatch']
      },
      messenger: {
        component: new TransientMessageBus<any>(),
      },
      scheduler: {
        component: { getSchedule: async () => im.OrderedMap({}) },
      },
      speaker: {
        component: { say: async (message: string) => console.log(message) },
      },
      stopwatch: {
        component: new IntervalStopwatch(1000),
        dependencies: ['messenger']
      },
    },
  });

const system = buildSystem();