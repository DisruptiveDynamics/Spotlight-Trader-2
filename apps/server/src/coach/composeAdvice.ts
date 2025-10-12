/**
 * Compose ultra-brief 1-line advice from trade proposal data
 * Enforces consistent output format for voice responses
 */

export interface AdviceParams {
  symbol: string;
  grade?: string;
  entry: number;
  sl: number; // stop loss
  tps: number[]; // take profit targets
  rr: number; // risk-reward ratio
  note?: string;
}

/**
 * Creates a surgical 1-line advice string
 * Format: "{SYMBOL} {grade} entry {entry}, SL {sl}, TP {tp}, R:R {rr}. {note}"
 * 
 * @example
 * composeAdvice({
 *   symbol: 'SPY',
 *   grade: 'A',
 *   entry: 581.00,
 *   sl: 579.80,
 *   tps: [582.50, 583.20],
 *   rr: 1.3,
 *   note: 'Volume confirming'
 * })
 * // Returns: "SPY A entry 581.00, SL 579.80, TP 582.50, R:R 1.3. Volume confirming."
 */
export function composeAdvice(params: AdviceParams): string {
  const { symbol, grade, entry, sl, tps, rr, note } = params;
  
  const tp = tps[0]; // Use first target
  const gradeStr = grade ? `${grade} ` : '';
  const noteStr = note ? ` ${note}.` : '';

  return `${symbol} ${gradeStr}entry ${entry.toFixed(2)}, SL ${sl.toFixed(2)}, TP ${tp?.toFixed(2)}, R:R ${rr.toFixed(1)}.${noteStr}`;
}

/**
 * Compose risk block message
 * Format: "Risk {status}. Cooldown {seconds}s — no entry."
 */
export interface RiskBlockParams {
  status: string; // RED, YELLOW, etc.
  cooldownSec?: number;
  reason?: string;
}

export function composeRiskBlock(params: RiskBlockParams): string {
  const { status, cooldownSec, reason } = params;
  
  if (cooldownSec && cooldownSec > 0) {
    return `Risk ${status}. Cooldown ${cooldownSec}s — no entry.`;
  }
  
  if (reason) {
    return `Risk ${status}. ${reason}`;
  }
  
  return `Risk ${status} — no entry.`;
}

/**
 * Compose "no edge" message
 * Format: "No edge now; volume {volFactor}×, {regime} regime."
 */
export interface NoEdgeParams {
  symbol?: string;
  volFactor?: number;
  regime?: string;
  reason?: string;
}

export function composeNoEdge(params: NoEdgeParams): string {
  const { symbol, volFactor, regime, reason } = params;
  
  const parts: string[] = ['No edge now'];
  
  if (volFactor !== undefined) {
    parts.push(`volume ${volFactor.toFixed(1)}×`);
  }
  
  if (regime) {
    parts.push(`${regime} regime`);
  }
  
  if (reason) {
    parts.push(reason);
  }
  
  const symbolPrefix = symbol ? `${symbol}: ` : '';
  return `${symbolPrefix}${parts.join('; ')}.`;
}

/**
 * Extract advice params from propose_entry_exit tool response
 */
export function extractAdviceFromProposal(proposal: any): AdviceParams | null {
  if (!proposal || !proposal.entry || !proposal.stop) {
    return null;
  }

  return {
    symbol: proposal.symbol || 'UNKNOWN',
    grade: proposal.qualityGrade || proposal.grade,
    entry: proposal.entry,
    sl: proposal.stop,
    tps: proposal.targets || [proposal.target1, proposal.target2].filter(Boolean),
    rr: proposal.rMultiple || proposal.rr || calculateRR(proposal.entry, proposal.stop, proposal.target1),
    note: proposal.note || proposal.rationale?.substring(0, 50), // Keep note brief
  };
}

/**
 * Calculate R:R ratio if not provided
 */
function calculateRR(entry: number, stop: number, target: number): number {
  if (!entry || !stop || !target) return 0;
  const risk = Math.abs(entry - stop);
  const reward = Math.abs(target - entry);
  return risk > 0 ? reward / risk : 0;
}
