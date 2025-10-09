export interface Bar {
  symbol: string;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  seq: number;
  bar_start: number;
  bar_end: number;
}

export interface Microbar extends Bar {
  timeframe: '250ms';
}

export interface MinuteBar extends Bar {
  timeframe: '1m';
}

export interface Alert {
  id: string;
  symbol: string;
  ruleId: string;
  ruleVersion: string;
  confidence: number;
  message: string;
  timestamp: number;
}

export interface CoachProfile {
  userId: string;
  agentName: string;
  voiceId: string;
  jargonLevel: number;
  decisiveness: number;
  tone: string;
}
