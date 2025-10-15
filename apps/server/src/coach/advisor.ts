import type { Signal, SignalExplanation } from "@shared/types/rules";

import { db } from "../db";
import { signalExplanations } from "../db/schema";
import { eventBus } from "../market/eventBus";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

export class CoachAdvisor {
  start(): void {
    eventBus.on("signal:new", this.handleNewSignal.bind(this));
  }

  private async handleNewSignal(signal: Signal): Promise<void> {
    try {
      const explanation = await this.generateExplanation(signal);
      await this.saveExplanation(signal.id, explanation);

      console.log(`Coach explanation for signal ${signal.id}:`, explanation.text);
    } catch (error) {
      console.error("Failed to generate signal explanation:", error);
    }
  }

  private async generateExplanation(signal: Signal): Promise<SignalExplanation> {
    if (!OPENAI_API_KEY) {
      const fallbackText = `Signal detected for ${signal.symbol}: ${signal.direction} setup with ${(signal.confidence * 100).toFixed(0)}% confidence.`;
      return {
        id: `exp_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
        signalId: signal.id,
        text: fallbackText,
        tokens: "0",
        model: "fallback",
      };
    }

    const prompt = this.buildPrompt(signal);

    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content:
                "You are a concise trading coach. Explain trade setups in 1-2 sentences. Focus on entry, risk level, and key technical factors.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          temperature: 0.7,
          max_tokens: 150,
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { total_tokens?: number };
        model?: string;
      };
      const text = data.choices?.[0]?.message?.content || "No explanation generated";
      const tokens = data.usage?.total_tokens?.toString() || "0";

      return {
        id: `exp_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
        signalId: signal.id,
        text,
        tokens,
        model: data.model || "gpt-4o-mini",
      };
    } catch (error) {
      console.error("OpenAI API call failed:", error);
      const fallbackText = `Signal detected for ${signal.symbol}: ${signal.direction} setup with ${(signal.confidence * 100).toFixed(0)}% confidence.`;
      return {
        id: `exp_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
        signalId: signal.id,
        text: fallbackText,
        tokens: "0",
        model: "fallback",
      };
    }
  }

  private buildPrompt(signal: Signal): string {
    return `A trading rule triggered a ${signal.direction.toUpperCase()} signal on ${signal.symbol} with ${(signal.confidence * 100).toFixed(0)}% confidence. Context: ${JSON.stringify(signal.ctx)}. Explain this setup to a trader.`;
  }

  private async saveExplanation(signalId: string, explanation: SignalExplanation): Promise<void> {
    await db.insert(signalExplanations).values({
      id: explanation.id,
      signalId,
      text: explanation.text,
      tokens: explanation.tokens,
      model: explanation.model,
    });
  }

  stop(): void {
    eventBus.off("signal:new", this.handleNewSignal.bind(this));
  }
}

export const coachAdvisor = new CoachAdvisor();
