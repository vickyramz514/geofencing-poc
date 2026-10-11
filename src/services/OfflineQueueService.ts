import type {QueueItem, QueueKind} from '../types';
import type {KeyValueStorage} from './storage';
import {backoffDelayMs} from '../utils/retry';

const STORAGE_KEY = 'geofencepoc.offlineQueue.v1';
const MAX_SENT_KEYS = 500;

interface PersistedQueue {
  items: QueueItem[];
  sentKeys: string[];
}

export interface EnqueueInput {
  kind: QueueKind;
  idempotencyKey: string;
  payload: QueueItem['payload'];
  deliveryId?: string;
  attempts?: number;
  nextRetryAtMs?: number;
}

export interface SyncResult {
  synced: number;
  failed: number;
  skipped: boolean;
}

const EMPTY_QUEUE: PersistedQueue = {items: [], sentKeys: []};

export class OfflineQueueService {
  private tail: Promise<void> = Promise.resolve();

  constructor(
    private readonly storage: KeyValueStorage,
    private readonly now: () => number = Date.now,
  ) {}

  async enqueue(input: EnqueueInput): Promise<boolean> {
    return this.exclusive(async () => {
      const data = await this.load();
      if (this.containsKey(data, input.idempotencyKey)) {
        return false;
      }
      const item: QueueItem = {
        id: `${input.kind}:${input.idempotencyKey}:${this.now()}`,
        kind: input.kind,
        idempotencyKey: input.idempotencyKey,
        payload: input.payload,
        deliveryId: input.deliveryId,
        attempts: input.attempts ?? 0,
        nextRetryAtMs: input.nextRetryAtMs ?? 0,
        createdAtMs: this.now(),
      };
      data.items.push(item);
      await this.save(data);
      return true;
    });
  }

  async hasSeen(idempotencyKey: string): Promise<boolean> {
    return this.exclusive(async () => {
      const data = await this.load();
      return this.containsKey(data, idempotencyKey);
    });
  }

  async rememberSent(idempotencyKey: string): Promise<void> {
    await this.exclusive(async () => {
      const data = await this.load();
      if (!data.sentKeys.includes(idempotencyKey)) {
        data.sentKeys.push(idempotencyKey);
        data.sentKeys = data.sentKeys.slice(-MAX_SENT_KEYS);
        await this.save(data);
      }
    });
  }

  async list(): Promise<QueueItem[]> {
    return this.exclusive(async () => {
      const data = await this.load();
      return data.items.map(item => ({...item}));
    });
  }

  async count(): Promise<number> {
    return this.exclusive(async () => {
      const data = await this.load();
      return data.items.length;
    });
  }

  async sync(options: {
    isOnline: boolean;
    send: (item: QueueItem) => Promise<void>;
    include?: (item: QueueItem) => boolean;
  }): Promise<SyncResult> {
    if (!options.isOnline) {
      return {synced: 0, failed: 0, skipped: true};
    }

    return this.exclusive(async () => {
      const data = await this.load();
      const now = this.now();
      let synced = 0;
      let failed = 0;

      for (const item of [...data.items]) {
        if (options.include && !options.include(item)) {
          continue;
        }
        if (item.nextRetryAtMs > now) {
          continue;
        }
        try {
          await options.send(item);
          data.items = data.items.filter(stored => stored.id !== item.id);
          if (!data.sentKeys.includes(item.idempotencyKey)) {
            data.sentKeys.push(item.idempotencyKey);
          }
          synced += 1;
        } catch {
          const stored = data.items.find(candidate => candidate.id === item.id);
          if (stored) {
            stored.attempts += 1;
            stored.nextRetryAtMs = now + backoffDelayMs(stored.attempts);
          }
          failed += 1;
        }
      }

      data.sentKeys = data.sentKeys.slice(-MAX_SENT_KEYS);
      await this.save(data);
      return {synced, failed, skipped: false};
    });
  }

  private async exclusive<T>(work: () => Promise<T>): Promise<T> {
    const previous = this.tail;
    let release = () => undefined as void;
    this.tail = new Promise(resolve => {
      release = resolve;
    });
    await previous;
    try {
      return await work();
    } finally {
      release();
    }
  }

  private containsKey(data: PersistedQueue, idempotencyKey: string): boolean {
    return (
      data.sentKeys.includes(idempotencyKey) ||
      data.items.some(item => item.idempotencyKey === idempotencyKey)
    );
  }

  private async load(): Promise<PersistedQueue> {
    const raw = await this.storage.getItem(STORAGE_KEY);
    if (!raw) {
      return {items: [], sentKeys: []};
    }
    try {
      const parsed = JSON.parse(raw) as PersistedQueue;
      return {
        items: Array.isArray(parsed.items) ? parsed.items : [],
        sentKeys: Array.isArray(parsed.sentKeys) ? parsed.sentKeys : [],
      };
    } catch {
      return {items: [], sentKeys: [...EMPTY_QUEUE.sentKeys]};
    }
  }

  private async save(data: PersistedQueue): Promise<void> {
    await this.storage.setItem(STORAGE_KEY, JSON.stringify(data));
  }
}
