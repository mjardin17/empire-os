/**
 * Event Bus — In-Process Implementation
 * Dev: pure in-memory pub/sub with history ring buffer.
 * Prod: swap to Redis pub/sub + PostgreSQL EventLog for durability.
 */

import { randomUUID } from 'crypto'
import type {
  EventBus,
  DomainEvent,
  EventHandler,
  SubscribeOptions,
  HistoryOptions,
  EventBusStats,
  Unsubscribe,
} from '../interfaces/index.js'

const HISTORY_LIMIT = 1000  // per topic

export class InProcessEventBus implements EventBus {
  private subscribers = new Map<string, Map<string, EventHandler>>()
  private _history = new Map<string, DomainEvent[]>()
  private _stats = {
    totalPublished: 0,
    totalDelivered: 0,
    pendingRetries: 0,
  }

  async publish(
    event: Omit<DomainEvent, 'id' | 'timestamp'>
  ): Promise<DomainEvent> {
    const full: DomainEvent = {
      ...event,
      id: randomUUID(),
      timestamp: new Date().toISOString(),
    }

    // Store in history
    if (!this._history.has(full.topic)) this._history.set(full.topic, [])
    const topicHistory = this._history.get(full.topic)!
    topicHistory.push(full)
    if (topicHistory.length > HISTORY_LIMIT) topicHistory.shift()

    this._stats.totalPublished++

    // Deliver to subscribers
    const topicSubs = this.subscribers.get(full.topic)
    if (topicSubs) {
      const deliveries = Array.from(topicSubs.values()).map(handler =>
        Promise.resolve(handler(full)).catch(err => {
          console.error(`[EventBus] Handler error on topic ${full.topic}:`, err)
        })
      )
      await Promise.all(deliveries)
      this._stats.totalDelivered += topicSubs.size
    }

    return full
  }

  subscribe(
    topic: string,
    handler: EventHandler,
    options?: SubscribeOptions
  ): Unsubscribe {
    if (!this.subscribers.has(topic)) {
      this.subscribers.set(topic, new Map())
    }

    const subId = randomUUID()
    this.subscribers.get(topic)!.set(subId, handler)

    // Replay history if requested
    if (options?.fromBeginning) {
      const history = this._history.get(topic) ?? []
      Promise.resolve().then(async () => {
        for (const event of history) {
          await Promise.resolve(handler(event)).catch(console.error)
        }
      })
    }

    return () => {
      this.subscribers.get(topic)?.delete(subId)
    }
  }

  async history(topic: string, options?: HistoryOptions): Promise<DomainEvent[]> {
    let events = this._history.get(topic) ?? []

    if (options?.since) {
      const since = new Date(options.since).getTime()
      events = events.filter(e => new Date(e.timestamp).getTime() >= since)
    }
    if (options?.until) {
      const until = new Date(options.until).getTime()
      events = events.filter(e => new Date(e.timestamp).getTime() <= until)
    }
    if (options?.sourceModuleId) {
      events = events.filter(e => e.source === options.sourceModuleId)
    }

    const limit = options?.limit ?? 100
    return events.slice(-limit)
  }

  async stats(): Promise<EventBusStats> {
    const topicCounts: Record<string, number> = {}
    for (const [topic, events] of this._history.entries()) {
      topicCounts[topic] = events.length
    }

    let activeSubscribers = 0
    for (const subs of this.subscribers.values()) {
      activeSubscribers += subs.size
    }

    return {
      ...this._stats,
      activeSubscribers,
      topicCounts,
    }
  }

  async replay(correlationId: string): Promise<DomainEvent[]> {
    const results: DomainEvent[] = []
    for (const events of this._history.values()) {
      results.push(...events.filter(e => e.correlationId === correlationId))
    }
    return results.sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    )
  }
}
