export type TradeSide = "long" | "short";

export interface TradeScale {
  at: string;
  price: number;
  size?: number;
}

export interface TradeTape {
  volumeZ?: number;
  spreadBp?: number;
  uptickDelta?: number;
}

export type TradeRegime = "trend" | "range" | "news" | "illiquid";

export interface Trade {
  id: string;
  userId: string;
  symbol: string;
  side: TradeSide;
  planText?: string;
  ruleId?: string;
  ruleVersion?: string;
  entryTime?: string;
  entryPrice?: number;
  scales?: TradeScale[];
  exitTime?: string;
  exitPrice?: number;
  outcomePnl?: number;
  notes?: string;
  regime?: TradeRegime;
  tape?: TradeTape;
  createdAt: string;
}

export interface JournalEntry {
  id: string;
  userId: string;
  date: string;
  markdown: string;
  trades?: Trade[];
}

export interface JournalLink {
  id: string;
  journalId: string;
  linkType: string;
  linkId: string;
}
