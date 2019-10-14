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
  private subscriptions: im.Map<Symbol, im.List<(message: any) => Promise<any>>>;

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
      this.subscriptions.update(topic, (consumers) => (consumers || im.List()).push(consumer);
    return true;
  }

  async unsubscribe<S extends T['id']>(
    topic: S,
    consumer: (message: TopicType<T, S>) => Promise<boolean>
  ): Promise<boolean> {
    // TODO actually do it ha ha
    this.subscriptions =
      this.subscriptions.update(topic, (consumers) => consumers);
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

const buildSystem = () =>
  im.fromJS({
    roles: {
      clock: 'Observes the current time',
      scheduler: 'Renders the exercise schedule',
      speaker: 'Utters messages',
      state: 'Manages the system state'
    },
    components: {
      clock: {
        component: { now: () => new Date() },
        scheduler: { getSchedule: async () => im.OrderedMap({}) },
        speaker: { say: async (message: string) => console.log(message) }
      }
    },
  });

const system = buildSystem();