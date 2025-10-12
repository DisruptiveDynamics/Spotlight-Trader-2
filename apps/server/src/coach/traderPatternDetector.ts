import { db } from '../db/index';
import { journalEvents } from '../db/schema';
import { eq, and, gte, desc, sql } from 'drizzle-orm';
import { voiceMemoryBridge } from './voiceMemoryBridge';

interface TraderPattern {
  type: 'late_entry' | 'oversizing' | 'ignoring_stop' | 'chasing' | 'fomo' | 'revenge_trade';
  symbol: string;
  count: number;
  lastOccurrence: Date;
  severity: 'low' | 'medium' | 'high';
  recommendation: string;
}

export class TraderPatternDetector {
  private readonly LOOKBACK_DAYS = 7;
  private readonly PATTERN_THRESHOLD = 2; // Need 2+ occurrences to flag

  async analyzeRecentBehavior(userId: string): Promise<TraderPattern[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.LOOKBACK_DAYS);

    const recentEvents = await db
      .select()
      .from(journalEvents)
      .where(
        and(
          eq(journalEvents.userId, userId),
          gte(journalEvents.timestamp, cutoffDate)
        )
      )
      .orderBy(desc(journalEvents.timestamp))
      .limit(50);

    const patterns: TraderPattern[] = [];

    // Detect late entries
    const lateEntries = recentEvents.filter(e => 
      e.reasoning?.toLowerCase().includes('late') || 
      e.reasoning?.toLowerCase().includes('chased')
    );
    if (lateEntries.length >= this.PATTERN_THRESHOLD) {
      patterns.push({
        type: 'late_entry',
        symbol: this.getMostCommonSymbol(lateEntries),
        count: lateEntries.length,
        lastOccurrence: lateEntries[0]?.timestamp || new Date(),
        severity: this.calculateSeverity(lateEntries.length),
        recommendation: 'Wait for confirmation. Set alerts instead of watching constantly.',
      });
    }

    // Detect chasing behavior
    const chasing = recentEvents.filter(e =>
      e.decision === 'accept' && 
      e.reasoning?.toLowerCase().includes('chase')
    );
    if (chasing.length >= this.PATTERN_THRESHOLD) {
      patterns.push({
        type: 'chasing',
        symbol: this.getMostCommonSymbol(chasing),
        count: chasing.length,
        lastOccurrence: chasing[0]?.timestamp || new Date(),
        severity: this.calculateSeverity(chasing.length),
        recommendation: 'Stick to your plan. No FOMO entries.',
      });
    }

    // Detect FOMO patterns
    const fomo = recentEvents.filter(e =>
      e.reasoning?.toLowerCase().includes('fomo') ||
      e.reasoning?.toLowerCase().includes('fear of missing')
    );
    if (fomo.length >= this.PATTERN_THRESHOLD) {
      patterns.push({
        type: 'fomo',
        symbol: this.getMostCommonSymbol(fomo),
        count: fomo.length,
        lastOccurrence: fomo[0]?.timestamp || new Date(),
        severity: 'high',
        recommendation: 'Take a break. FOMO is your enemy. Trust your edge.',
      });
    }

    // Detect oversizing
    const oversizing = recentEvents.filter(e =>
      e.reasoning?.toLowerCase().includes('oversized') ||
      e.reasoning?.toLowerCase().includes('too big')
    );
    if (oversizing.length >= this.PATTERN_THRESHOLD) {
      patterns.push({
        type: 'oversizing',
        symbol: this.getMostCommonSymbol(oversizing),
        count: oversizing.length,
        lastOccurrence: oversizing[0]?.timestamp || new Date(),
        severity: 'high',
        recommendation: 'Reduce size by 50%. Risk management is paramount.',
      });
    }

    // Detect revenge trading (back-to-back trades after losses)
    const recentLosses = recentEvents.filter(e =>
      e.type === 'exit' && (e.realizedR !== null && e.realizedR < 0)
    );
    
    if (recentLosses.length >= 2) {
      // Check for quick successive trades after losses (within 30 minutes)
      const sortedByTime = [...recentLosses].sort((a, b) => 
        (b.timestamp?.getTime() || 0) - (a.timestamp?.getTime() || 0)
      );
      
      for (let i = 0; i < sortedByTime.length - 1; i++) {
        const timeDiff = (sortedByTime[i]?.timestamp?.getTime() || 0) - 
                        (sortedByTime[i + 1]?.timestamp?.getTime() || 0);
        
        // Revenge trade: entered within 30 min of previous loss
        if (timeDiff < 30 * 60 * 1000) {
          patterns.push({
            type: 'revenge_trade',
            symbol: sortedByTime[i]?.symbol || 'multiple',
            count: recentLosses.length,
            lastOccurrence: sortedByTime[0]?.timestamp || new Date(),
            severity: 'high',
            recommendation: 'Stop trading. Take a 30-minute break after losses. Revenge trading destroys accounts.',
          });
          break;
        }
      }
    }

    // Save patterns to memory
    for (const pattern of patterns) {
      await voiceMemoryBridge.captureTraderPattern(
        userId,
        pattern.type,
        `${pattern.count} occurrences on ${pattern.symbol}. ${pattern.recommendation}`
      );
    }

    return patterns;
  }

  async checkForPattern(
    userId: string,
    symbol: string,
    decision: string,
    reasoning: string
  ): Promise<string | null> {
    const patterns = await this.analyzeRecentBehavior(userId);
    
    // Check if current action matches a known pattern
    const relevantPattern = patterns.find(p => {
      if (p.symbol === symbol) {
        const lowerReasoning = reasoning.toLowerCase();
        switch (p.type) {
          case 'late_entry': return lowerReasoning.includes('late') || lowerReasoning.includes('chase');
          case 'chasing': return lowerReasoning.includes('chase');
          case 'fomo': return lowerReasoning.includes('fomo');
          case 'oversizing': return lowerReasoning.includes('oversized');
          default: return false;
        }
      }
      return false;
    });

    if (relevantPattern) {
      return `⚠️ Pattern alert: You've done this ${relevantPattern.count} times in 7 days. ${relevantPattern.recommendation}`;
    }

    return null;
  }

  private getMostCommonSymbol(events: any[]): string {
    const symbolCounts = new Map<string, number>();
    events.forEach(e => {
      const count = symbolCounts.get(e.symbol) || 0;
      symbolCounts.set(e.symbol, count + 1);
    });

    let maxSymbol = 'multiple';
    let maxCount = 0;
    symbolCounts.forEach((count, symbol) => {
      if (count > maxCount) {
        maxCount = count;
        maxSymbol = symbol;
      }
    });

    return maxSymbol;
  }

  private calculateSeverity(count: number): 'low' | 'medium' | 'high' {
    if (count >= 5) return 'high';
    if (count >= 3) return 'medium';
    return 'low';
  }
}

export const traderPatternDetector = new TraderPatternDetector();
