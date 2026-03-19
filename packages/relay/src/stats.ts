/**
 * Per-Protocol Relay Metrics
 *
 * Tracks events/sec and bandwidth for each firehose protocol using a
 * sliding window (60s).
 */

export type ProtocolType = 'socketio' | 'websocket' | 'jetstream';

interface WindowEntry {
  timestamp: number;
  byteSize: number;
}

interface ProtocolStats {
  totalEvents: number;
  totalBytes: number;
  eventsPerSec: number;
  bytesPerSec: number;
  connectedClients: number;
}

export interface StatsSnapshot {
  socketio: ProtocolStats;
  websocket: ProtocolStats;
  jetstream: ProtocolStats;
}

const WINDOW_MS = 60_000;

export class RelayStats {
  private events: Map<ProtocolType, WindowEntry[]> = new Map();
  private totals: Map<ProtocolType, { events: number; bytes: number }> = new Map();
  private connections: Map<ProtocolType, number> = new Map();

  constructor() {
    for (const proto of ['socketio', 'websocket', 'jetstream'] as ProtocolType[]) {
      this.events.set(proto, []);
      this.totals.set(proto, { events: 0, bytes: 0 });
      this.connections.set(proto, 0);
    }
  }

  /**
   * Record an event being sent on a protocol
   */
  recordEvent(protocol: ProtocolType, byteSize: number): void {
    const now = Date.now();
    this.events.get(protocol)!.push({ timestamp: now, byteSize });
    const t = this.totals.get(protocol)!;
    t.events++;
    t.bytes += byteSize;
  }

  /**
   * Record a connection change (+1 or -1)
   */
  recordConnection(protocol: ProtocolType, delta: 1 | -1): void {
    const current = this.connections.get(protocol) || 0;
    this.connections.set(protocol, Math.max(0, current + delta));
  }

  /**
   * Get a snapshot of current stats
   */
  getSnapshot(): StatsSnapshot {
    const now = Date.now();
    const cutoff = now - WINDOW_MS;

    const buildStats = (proto: ProtocolType): ProtocolStats => {
      // Prune old entries
      const entries = this.events.get(proto)!;
      const firstValid = entries.findIndex(e => e.timestamp >= cutoff);
      if (firstValid > 0) entries.splice(0, firstValid);

      const windowEvents = entries.length;
      const windowBytes = entries.reduce((sum, e) => sum + e.byteSize, 0);
      const windowSec = WINDOW_MS / 1000;

      const t = this.totals.get(proto)!;

      return {
        totalEvents: t.events,
        totalBytes: t.bytes,
        eventsPerSec: Math.round((windowEvents / windowSec) * 100) / 100,
        bytesPerSec: Math.round((windowBytes / windowSec) * 100) / 100,
        connectedClients: this.connections.get(proto) || 0,
      };
    };

    return {
      socketio: buildStats('socketio'),
      websocket: buildStats('websocket'),
      jetstream: buildStats('jetstream'),
    };
  }
}

export default RelayStats;
