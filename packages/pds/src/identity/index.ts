export * from './did.js';
export * from './handle.js';
export {
  DidResolver,
  createDidResolver,
  ResolvedDid,
  DidResolverConfig,
  // Renamed to avoid conflicts with did.js types
  ServiceEndpoint as ResolverServiceEndpoint,
} from './resolver.js';
