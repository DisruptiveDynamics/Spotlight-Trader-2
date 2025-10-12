import { Router, type Request, type Router as ExpressRouter } from 'express';
import { toolHandlers } from '../copilot/tools/handlers';
import { copilotBroadcaster } from '../copilot/broadcaster';
import type {
  GetChartSnapshotParams,
  SubscribeMarketStreamParams,
  ProposeCalloutParams,
  ProposeEntryExitParams,
  EvaluateRulesParams,
  LogJournalEventParams,
  SummarizeSessionParams,
  GetPatternSummaryParams,
  GetRecommendedRiskBoxParams,
  GenerateTradePlanParams,
} from '../copilot/tools/types';

const router = Router();

router.post('/get_chart_snapshot', async (req, res) => {
  try {
    const params = req.body as GetChartSnapshotParams;
    const result = await toolHandlers.get_chart_snapshot(params);
    res.json(result);
  } catch (error) {
    console.error('get_chart_snapshot error:', error);
    res.status(500).json({ error: 'Failed to get chart snapshot' });
  }
});

router.post('/subscribe_market_stream', async (req, res) => {
  try {
    const params = req.body as SubscribeMarketStreamParams;
    const result = await toolHandlers.subscribe_market_stream(params);
    res.json(result);
  } catch (error) {
    console.error('subscribe_market_stream error:', error);
    res.status(500).json({ error: 'Failed to subscribe to market stream' });
  }
});

router.post('/propose_callout', async (req, res) => {
  try {
    const params = req.body as ProposeCalloutParams;
    const result = await toolHandlers.propose_callout(params);
    res.json(result);
  } catch (error) {
    console.error('propose_callout error:', error);
    res.status(500).json({ error: 'Failed to propose callout' });
  }
});

router.post('/propose_entry_exit', async (req, res) => {
  try {
    const params = req.body as ProposeEntryExitParams;
    const result = await toolHandlers.propose_entry_exit(params);
    res.json(result);
  } catch (error) {
    console.error('propose_entry_exit error:', error);
    res.status(500).json({ error: 'Failed to propose entry/exit' });
  }
});

router.post('/evaluate_rules', async (req, res) => {
  try {
    const params = req.body as EvaluateRulesParams;
    const result = await toolHandlers.evaluate_rules(params);
    res.json(result);
  } catch (error) {
    console.error('evaluate_rules error:', error);
    res.status(500).json({ error: 'Failed to evaluate rules' });
  }
});

router.post('/log_journal_event', async (req, res) => {
  try {
    const params = req.body as LogJournalEventParams;
    const result = await toolHandlers.log_journal_event(params);
    res.json(result);
  } catch (error) {
    console.error('log_journal_event error:', error);
    res.status(500).json({ error: 'Failed to log journal event' });
  }
});

router.post('/summarize_session', async (req, res) => {
  try {
    const params = req.body as SummarizeSessionParams;
    const result = await toolHandlers.summarize_session(params);
    res.json(result);
  } catch (error) {
    console.error('summarize_session error:', error);
    res.status(500).json({ error: 'Failed to summarize session' });
  }
});

router.post('/get_pattern_summary', async (req, res) => {
  try {
    const params = req.body as GetPatternSummaryParams;
    const result = await toolHandlers.get_pattern_summary(params);
    res.json(result);
  } catch (error) {
    console.error('get_pattern_summary error:', error);
    res.status(500).json({ error: 'Failed to get pattern summary' });
  }
});

router.post('/get_recommended_risk_box', async (req, res) => {
  try {
    const params = req.body as GetRecommendedRiskBoxParams;
    const result = await toolHandlers.get_recommended_risk_box(params);
    res.json(result);
  } catch (error) {
    console.error('get_recommended_risk_box error:', error);
    res.status(500).json({ error: 'Failed to get recommended risk box' });
  }
});

router.post('/generate_trade_plan', async (req, res) => {
  try {
    const params = req.body as GenerateTradePlanParams;
    const result = await toolHandlers.generate_trade_plan(params);
    res.json(result);
  } catch (error) {
    console.error('generate_trade_plan error:', error);
    res.status(500).json({ error: 'Failed to generate trade plan' });
  }
});

router.post('/test/trigger-callout', async (req, res) => {
  try {
    const result = await toolHandlers.propose_callout({
      kind: 'watch',
      context: {
        symbol: 'SPY',
        timeframe: '5m',
        setupTag: 'VWAP_RECLAIM',
        rationale: 'SPY reclaiming VWAP with strong volume - watch for continuation above 580',
        qualityGrade: 'A',
        urgency: 'soon',
      },
    });
    res.json({ success: true, callout: result });
  } catch (error) {
    console.error('test trigger error:', error);
    res.status(500).json({ error: 'Failed to trigger test callout' });
  }
});

router.get('/callouts/stream', (req: Request, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const userId = 'demo-user';
  copilotBroadcaster.addClient(userId, res);

  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
  });
});

export const copilotToolsRouter: ExpressRouter = router;
