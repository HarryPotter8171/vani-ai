import type { PlanId, QuotaRemaining, UsageMetric } from '@/lib/billing/types';

export interface AnalyticsTotals {
  chats: number;
  tokens: number;
  imagesGenerated: number;
  voiceMinutes: number;
  deepResearchSessions: number;
  browserSessions: number;
  mcpCalls: number;
  codeInterpreterRuns: number;
  fileStorageBytes: number;
}

export interface ChartPoint {
  date?: string;
  label?: string;
  start?: string;
  end?: string;
  total?: number;
  metrics: Record<string, number>;
}

export interface UserAnalytics {
  totals: AnalyticsTotals;
  plan: { planId: PlanId | string; name: string; rank: number };
  monthlyUsage: Record<UsageMetric | string, number>;
  remaining: QuotaRemaining[];
  period: { start: string | null; end: string | null };
  charts: {
    daily: ChartPoint[];
    weekly: ChartPoint[];
    monthly: ChartPoint[];
  };
  subscription: {
    status: string;
    billingInterval: string | null;
  };
}

export interface AdminUsersMetrics {
  total: number;
  active: number;
  new: number;
  paid: number;
}

export interface AdminFinanceMetrics {
  revenueCents: number;
  revenueSource: string;
  apiCostCents: number;
  apiCostUsd: number;
  profitEstimateCents: number;
  currency: string;
}

export interface AdminPerformanceMetrics {
  errorRate: number;
  errorsToday: number;
  requestsToday: number;
  averageResponseTimeMs: number;
}

export interface AdminUsageMetrics {
  tokens: number;
  images: number;
  voiceMinutes: number;
  chats: number;
  research: number;
  browser: number;
  code: number;
  mcp: number;
}

export interface AdminDashboard {
  users: AdminUsersMetrics;
  finance: AdminFinanceMetrics;
  performance: AdminPerformanceMetrics;
  usage: AdminUsageMetrics;
  modelUsage: Record<string, number>;
  charts: { daily: ChartPoint[] };
  generatedAt: string;
}

export interface HealthServiceStatus {
  healthy: boolean;
  [key: string]: unknown;
}

export interface SystemHealth {
  status: string;
  timestamp: string;
  uptimeSeconds: number;
  services: {
    mongodb: HealthServiceStatus;
    redis: HealthServiceStatus;
    queue: HealthServiceStatus;
    storage: HealthServiceStatus;
    cpu: HealthServiceStatus;
    memory: HealthServiceStatus;
    uptime: HealthServiceStatus;
  };
}

export interface AnalyticsLogEntry {
  id: string;
  type: string;
  userId: string | null;
  method: string;
  path: string;
  statusCode: number | null;
  latencyMs: number | null;
  category: string;
  model: string;
  tool: string;
  tokens: number;
  errorMessage: string;
  requestId: string;
  createdAt: string;
}

export interface AnalyticsIdentity {
  userId: string;
  role: 'user' | 'admin';
  isPlatformAdmin: boolean;
}
