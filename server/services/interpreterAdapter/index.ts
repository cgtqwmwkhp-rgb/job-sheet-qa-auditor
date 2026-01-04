/**
 * Interpreter Service Module
 * 
 * Provides advisory interpretation for document insights.
 * Primary: Gemini 2.5 Pro
 * Testing: Mock adapter (no-secrets CI)
 * 
 * CRITICAL: All interpreter output is ADVISORY ONLY.
 * Must never affect canonical findings or validatedFields.
 */

export * from './types';
export * from './geminiAdapter';
export * from './mockAdapter';

import type { InterpreterAdapter } from './types';
import { getInterpreterConfig } from './types';
import { createGeminiAdapter } from './geminiAdapter';
import { getMockInterpreter } from './mockAdapter';

/**
 * Get the configured interpreter adapter
 * 
 * Uses ENABLE_GEMINI_INSIGHTS env var to enable:
 * - 'true': Gemini 2.5 Pro (requires GEMINI_API_KEY)
 * - 'false' or unset: Disabled (returns empty insights)
 * 
 * For testing, use INTERPRETER_PROVIDER=mock
 */
export function getInterpreterAdapter(): InterpreterAdapter {
  const provider = process.env.INTERPRETER_PROVIDER;
  
  if (provider === 'mock') {
    return getMockInterpreter();
  }
  
  return createGeminiAdapter();
}

/**
 * Check if interpreter is enabled
 */
export function isInterpreterEnabled(): boolean {
  return getInterpreterConfig().enabled;
}
