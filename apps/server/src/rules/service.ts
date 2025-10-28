import { eventBus, type Bar } from '../market/eventBus';
import { ruleRegistry } from './registry';
import { ruleEvaluator } from './evaluator';
import type { RuleContext } from '@shared/types/rules';

export class RulesEngineService {
  private userId = 'default-user';

  start(): void {
    eventBus.on('bar:new:SPY:1m', this.handleNewBar.bind(this));
  }

  private async handleNewBar(bar: Bar): Promise<void> {
    try {
      const rules = await ruleRegistry.getActiveRules(this.userId);

      if (rules.length === 0) {
        return;
      }

      const context: RuleContext = {
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume,
      };

      for (const rule of rules) {
        const evaluation = ruleEvaluator.evaluate(rule, context, bar.seq);
        eventBus.emit('rule:evaluated', evaluation);

        if (evaluation.passed) {
          console.log(
            `Rule ${rule.name} passed at seq ${bar.seq}: ${evaluation.signal} (confidence: ${evaluation.confidence.toFixed(2)})`
          );
        }
      }
    } catch (error) {
      console.error('Error evaluating rules:', error);
    }
  }

  setUserId(userId: string): void {
    this.userId = userId;
    ruleRegistry.invalidateUserCache(userId);
  }

  stop(): void {
    eventBus.off('bar:new:SPY:1m', this.handleNewBar.bind(this));
  }
}

export const rulesEngineService = new RulesEngineService();
