/**
 * Spec Resolver Module
 * 
 * Provides specification pack management and resolution.
 * Supports pack layering: base → customer → document-type
 */

export * from './types';
export * from './resolver';
export { baseSpecPack } from './packs/base';

import { getSpecResolver } from './resolver';
import { baseSpecPack } from './packs/base';

/**
 * Initialize the spec resolver with default packs
 */
export function initializeSpecResolver(): void {
  const resolver = getSpecResolver();
  
  // Register base pack
  resolver.registerPack(baseSpecPack);
}

/**
 * Get resolved base spec
 */
export function getBaseSpec() {
  const resolver = getSpecResolver();
  
  // Ensure base pack is registered
  if (!resolver.getPack('base')) {
    resolver.registerPack(baseSpecPack);
  }
  
  return resolver.resolve('base');
}
