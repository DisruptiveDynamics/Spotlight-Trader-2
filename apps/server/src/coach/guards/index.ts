/**
 * Guard utilities for AI coach responses
 * Export all guards and helpers for use in testing and validation
 */

import { containsForbiddenPhrase } from './noDataGuard';

export { guardNoData, containsForbiddenPhrase, type GuardContext } from './noDataGuard';
export {
  composeAdvice,
  composeRiskBlock,
  composeNoEdge,
  extractAdviceFromProposal,
  type AdviceParams,
  type RiskBlockParams,
  type NoEdgeParams,
} from '../composeAdvice';

/**
 * Validate that AI responses follow the tightened policy
 * This is primarily for testing - the policy itself prevents violations
 */
export function validateResponse(response: string): {
  valid: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  // Check for forbidden "no data" claims
  if (containsForbiddenPhrase(response)) {
    issues.push('Response contains forbidden "no data" claim');
  }

  // Check for excessive length (should be 1 sentence unless critical)
  const sentences = response.split(/[.!?]+/).filter(Boolean);
  if (sentences.length > 2 && !response.includes('Risk') && !response.includes('Cooldown')) {
    issues.push('Response too long - should be 1 sentence unless critical');
  }

  // Check for vague language
  const vaguePatterns = [
    /\b(maybe|perhaps|possibly|might|could be)\b/i,
    /\b(I think|I believe|I'm not sure)\b/i,
  ];
  
  if (vaguePatterns.some(pattern => pattern.test(response))) {
    issues.push('Response contains uncertain/vague language - should verify with tools first');
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}
