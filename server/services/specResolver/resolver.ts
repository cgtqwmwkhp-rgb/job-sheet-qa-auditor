/**
 * Spec Resolver Implementation
 * 
 * Resolves specification packs with layering support.
 * Deterministic ordering guaranteed for rules and fields.
 */

import type {
  SpecPack,
  ResolvedSpec,
  ResolverOptions,
  ValidationRule,
  FieldDefinition,
  SpecResolver,
} from './types';

/**
 * Default spec resolver implementation
 */
export class DefaultSpecResolver implements SpecResolver {
  private packs: Map<string, SpecPack> = new Map();
  
  /**
   * Register a spec pack
   */
  registerPack(pack: SpecPack): void {
    // Validate pack structure
    if (!pack.id || !pack.version) {
      throw new Error(`Invalid pack: missing id or version`);
    }
    
    // Check for circular dependencies
    if (pack.extends) {
      this.checkCircularDependency(pack.id, pack.extends);
    }
    
    this.packs.set(pack.id, pack);
  }
  
  /**
   * Get a registered pack by ID
   */
  getPack(packId: string): SpecPack | undefined {
    return this.packs.get(packId);
  }
  
  /**
   * List all registered packs
   */
  listPacks(): SpecPack[] {
    return Array.from(this.packs.values()).sort((a, b) => a.id.localeCompare(b.id));
  }
  
  /**
   * Resolve a pack with its inheritance chain
   */
  resolve(packId: string, options: ResolverOptions = {}): ResolvedSpec {
    const pack = this.packs.get(packId);
    
    if (!pack) {
      throw new Error(`Pack not found: ${packId}`);
    }
    
    // Build inheritance chain (base to top)
    const chain = this.buildChain(packId, options.strict ?? false);
    
    // Merge fields (later packs override earlier)
    const fields = new Map<string, FieldDefinition>();
    for (const chainPackId of chain) {
      const chainPack = this.packs.get(chainPackId)!;
      for (const field of chainPack.fields) {
        fields.set(field.field, { ...fields.get(field.field), ...field });
      }
    }
    
    // Merge rules (later packs override earlier by ruleId)
    const rulesMap = new Map<string, ValidationRule>();
    for (const chainPackId of chain) {
      const chainPack = this.packs.get(chainPackId)!;
      for (const rule of chainPack.rules) {
        rulesMap.set(rule.ruleId, { ...rulesMap.get(rule.ruleId), ...rule });
      }
    }
    
    // Convert to sorted array (deterministic order by ruleId)
    let rules = Array.from(rulesMap.values()).sort((a, b) => 
      a.ruleId.localeCompare(b.ruleId, undefined, { numeric: true })
    );
    
    // Apply filters
    if (options.excludeDisabled) {
      rules = rules.filter(r => r.enabled);
    }
    
    if (options.filterTags && options.filterTags.length > 0) {
      rules = rules.filter(r => 
        r.tags?.some(t => options.filterTags!.includes(t))
      );
    }
    
    return {
      id: packId,
      version: pack.version,
      packChain: chain,
      fields,
      rules,
      resolvedAt: new Date().toISOString(),
    };
  }
  
  /**
   * Get all rules from resolved spec (deterministic order)
   */
  getRules(resolved: ResolvedSpec): ValidationRule[] {
    return resolved.rules;
  }
  
  /**
   * Get all fields from resolved spec
   */
  getFields(resolved: ResolvedSpec): FieldDefinition[] {
    return Array.from(resolved.fields.values()).sort((a, b) => 
      a.field.localeCompare(b.field)
    );
  }
  
  /**
   * Build inheritance chain (base to top)
   */
  private buildChain(packId: string, strict: boolean): string[] {
    const chain: string[] = [];
    const visited = new Set<string>();
    
    let currentId: string | undefined = packId;
    
    while (currentId) {
      if (visited.has(currentId)) {
        throw new Error(`Circular dependency detected: ${currentId}`);
      }
      
      visited.add(currentId);
      chain.unshift(currentId); // Add to front (base first)
      
      const pack = this.packs.get(currentId);
      
      if (!pack) {
        if (strict) {
          throw new Error(`Parent pack not found: ${currentId}`);
        }
        break;
      }
      
      currentId = pack.extends;
    }
    
    return chain;
  }
  
  /**
   * Check for circular dependencies
   */
  private checkCircularDependency(packId: string, extendsId: string): void {
    const visited = new Set<string>([packId]);
    let currentId: string | undefined = extendsId;
    
    while (currentId) {
      if (visited.has(currentId)) {
        throw new Error(`Circular dependency: ${packId} -> ${extendsId} -> ... -> ${currentId}`);
      }
      
      visited.add(currentId);
      const pack = this.packs.get(currentId);
      currentId = pack?.extends;
    }
  }
  
  /**
   * Clear all registered packs
   */
  clear(): void {
    this.packs.clear();
  }
}

/**
 * Create a new spec resolver instance
 */
export function createSpecResolver(): DefaultSpecResolver {
  return new DefaultSpecResolver();
}

/**
 * Singleton resolver instance
 */
let resolverInstance: DefaultSpecResolver | null = null;

export function getSpecResolver(): DefaultSpecResolver {
  if (!resolverInstance) {
    resolverInstance = new DefaultSpecResolver();
  }
  return resolverInstance;
}

export function resetSpecResolver(): void {
  if (resolverInstance) {
    resolverInstance.clear();
  }
  resolverInstance = null;
}
