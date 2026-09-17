type EventHandler<T = any> = (payload: T) => void;

class EventBus {
  private listeners: Map<string, Set<EventHandler>> = new Map();

  public on<T = any>(event: string, handler: EventHandler<T>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);

    return () => {
      this.off(event, handler);
    };
  }

  public off(event: string, handler: EventHandler): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.listeners.delete(event);
      }
    }
  }

  public emit<T = any>(event: string, payload: T): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(payload);
        } catch (err) {
          console.error(`Error in event handler for "${event}":`, err);
        }
      });
    }
  }
}

export const eventBus = new EventBus();
