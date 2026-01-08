/**
 * Contract Test: Storage Adapter Pattern
 * 
 * Validates storage adapter configuration and fail-fast behavior.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
  getStorageConfig, 
  validateStorageConfig,
  type StorageConfig 
} from '../../storage/types';
import { LocalStorageAdapter } from '../../storage/localAdapter';

describe('Storage Adapter Contract', () => {
  
  describe('Configuration Parsing', () => {
    
    it('defaults to local provider when STORAGE_PROVIDER not set', () => {
      const originalEnv = process.env.STORAGE_PROVIDER;
      delete process.env.STORAGE_PROVIDER;
      
      const config = getStorageConfig();
      expect(config.provider).toBe('local');
      
      process.env.STORAGE_PROVIDER = originalEnv;
    });
    
    it('reads STORAGE_PROVIDER from environment', () => {
      const originalEnv = process.env.STORAGE_PROVIDER;
      process.env.STORAGE_PROVIDER = 'azure';
      
      const config = getStorageConfig();
      expect(config.provider).toBe('azure');
      
      process.env.STORAGE_PROVIDER = originalEnv;
    });
    
    it('reads Azure config from environment', () => {
      const originalConn = process.env.AZURE_STORAGE_CONNECTION_STRING;
      const originalContainer = process.env.AZURE_STORAGE_CONTAINER_NAME;
      
      process.env.AZURE_STORAGE_CONNECTION_STRING = 'test-connection-string';
      process.env.AZURE_STORAGE_CONTAINER_NAME = 'test-container';
      
      const config = getStorageConfig();
      expect(config.azureConnectionString).toBe('test-connection-string');
      expect(config.azureContainerName).toBe('test-container');
      
      process.env.AZURE_STORAGE_CONNECTION_STRING = originalConn;
      process.env.AZURE_STORAGE_CONTAINER_NAME = originalContainer;
    });
    
  });
  
  describe('Configuration Validation (Fail-Fast)', () => {
    
    it('throws when azure provider selected without connection string', () => {
      const config: StorageConfig = {
        provider: 'azure',
        azureConnectionString: undefined,
        azureContainerName: 'test',
      };
      
      expect(() => validateStorageConfig(config)).toThrow(
        'AZURE_STORAGE_CONNECTION_STRING is required'
      );
    });
    
    it('throws when azure provider selected without container name', () => {
      const config: StorageConfig = {
        provider: 'azure',
        azureConnectionString: 'test-string',
        azureContainerName: undefined,
      };
      
      expect(() => validateStorageConfig(config)).toThrow(
        'AZURE_STORAGE_CONTAINER_NAME is required'
      );
    });
    
    it('accepts valid azure config', () => {
      const config: StorageConfig = {
        provider: 'azure',
        azureConnectionString: 'test-connection',
        azureContainerName: 'test-container',
      };
      
      expect(() => validateStorageConfig(config)).not.toThrow();
    });
    
    it('accepts local provider without extra config', () => {
      const config: StorageConfig = {
        provider: 'local',
      };
      
      expect(() => validateStorageConfig(config)).not.toThrow();
    });
    
    it('throws for unknown provider', () => {
      const config: StorageConfig = {
        provider: 'unknown-provider' as any,
      };
      
      expect(() => validateStorageConfig(config)).toThrow('Unknown STORAGE_PROVIDER');
    });
    
  });
  
  describe('Local Storage Adapter', () => {
    
    it('implements StorageAdapter interface', () => {
      const adapter = new LocalStorageAdapter('./test-uploads');
      
      expect(adapter.provider).toBe('local');
      expect(typeof adapter.put).toBe('function');
      expect(typeof adapter.get).toBe('function');
      expect(typeof adapter.healthCheck).toBe('function');
    });
    
    it('healthCheck returns healthy for local adapter', async () => {
      const adapter = new LocalStorageAdapter('./test-uploads');
      
      const result = await adapter.healthCheck();
      expect(result.healthy).toBe(true);
    });
    
    it('normalizes keys to prevent path traversal', async () => {
      const adapter = new LocalStorageAdapter('./test-uploads');
      
      // Test that put handles dangerous paths safely
      const result = await adapter.put('../../../etc/passwd', 'test-data');
      
      // Key should be normalized (no ../)
      expect(result.key).not.toContain('..');
    });
    
  });
  
  describe('Production Safety', () => {
    
    it('warns when using local storage in production', () => {
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      const config: StorageConfig = {
        provider: 'local',
      };
      
      validateStorageConfig(config);
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Using local storage in production')
      );
      
      consoleSpy.mockRestore();
      process.env.NODE_ENV = originalNodeEnv;
    });
    
  });
  
});

