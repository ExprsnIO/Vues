-- Federation/Relay Tables Migration

-- Relay events - persisted firehose events
CREATE TABLE IF NOT EXISTS relay_events (
  seq INTEGER PRIMARY KEY,
  did TEXT NOT NULL,
  commit JSONB NOT NULL,
  time TIMESTAMP DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS relay_events_did_idx ON relay_events(did);
CREATE INDEX IF NOT EXISTS relay_events_time_idx ON relay_events(time);

-- Relay subscribers - external services subscribing to firehose
CREATE TABLE IF NOT EXISTS relay_subscribers (
  id TEXT PRIMARY KEY,
  endpoint TEXT NOT NULL,
  cursor INTEGER,
  wanted_collections JSONB,
  status TEXT DEFAULT 'active' NOT NULL,
  last_heartbeat TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS relay_subscribers_status_idx ON relay_subscribers(status);
CREATE INDEX IF NOT EXISTS relay_subscribers_endpoint_idx ON relay_subscribers(endpoint);

-- DID cache - cached DID documents
CREATE TABLE IF NOT EXISTS did_cache (
  did TEXT PRIMARY KEY,
  document JSONB NOT NULL,
  handle TEXT,
  pds_endpoint TEXT,
  signing_key TEXT,
  resolved_at TIMESTAMP NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  stale_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS did_cache_handle_idx ON did_cache(handle);
CREATE INDEX IF NOT EXISTS did_cache_pds_endpoint_idx ON did_cache(pds_endpoint);
CREATE INDEX IF NOT EXISTS did_cache_expires_at_idx ON did_cache(expires_at);

-- Service registry - known federation services
CREATE TABLE IF NOT EXISTS service_registry (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  did TEXT,
  certificate_id TEXT,
  region TEXT,
  capabilities JSONB,
  status TEXT DEFAULT 'active' NOT NULL,
  last_health_check TIMESTAMP,
  health_check_failures INTEGER DEFAULT 0 NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS service_registry_type_idx ON service_registry(type);
CREATE INDEX IF NOT EXISTS service_registry_status_idx ON service_registry(status);
CREATE UNIQUE INDEX IF NOT EXISTS service_registry_endpoint_idx ON service_registry(endpoint);
CREATE INDEX IF NOT EXISTS service_registry_did_idx ON service_registry(did);
CREATE INDEX IF NOT EXISTS service_registry_region_idx ON service_registry(region);

-- Federation sync state - tracking sync with remote servers
CREATE TABLE IF NOT EXISTS federation_sync_state (
  id TEXT PRIMARY KEY,
  remote_endpoint TEXT NOT NULL,
  remote_did TEXT,
  last_synced_seq INTEGER,
  last_synced_at TIMESTAMP,
  sync_direction TEXT NOT NULL,
  status TEXT DEFAULT 'active' NOT NULL,
  error_message TEXT,
  error_count INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS federation_sync_state_endpoint_idx ON federation_sync_state(remote_endpoint);
CREATE INDEX IF NOT EXISTS federation_sync_state_status_idx ON federation_sync_state(status);
