/**
 * Response shapes of the Headroom proxy endpoints this extension reads (Headroom 0.37).
 * Fields Headroom may omit on older versions or for network (non-loopback) callers are optional.
 */

// ---------------------------------------------------------------------------
// /livez, /readyz
// ---------------------------------------------------------------------------

export interface LoopHealth {
  status: string;
  known_failures?: number;
  last_known_failure?: string | null;
}

export interface LivezResponse {
  service: string;
  status: string;
  alive: boolean;
  version: string;
  timestamp: string;
  uptime_seconds: number;
  loop_health?: LoopHealth;
}

export interface ComponentCheck {
  enabled: boolean;
  ready: boolean;
  status: string;
  error?: string | null;
  url?: string | null;
  backend?: string | null;
  optional?: boolean;
  [key: string]: unknown;
}

export interface CompressionExecutor {
  max_workers?: number;
  queued?: number;
  queued_max?: number;
  queue_timeouts_total?: number;
  running?: number;
  in_flight?: number;
  in_flight_max?: number;
  run_seconds_max?: number;
  leaked_threads_total?: number;
  quarantine_active?: boolean;
  timed_out_workers?: number;
}

export interface ReadyzResponse {
  service: string;
  status: string;
  ready: boolean;
  version: string;
  timestamp: string;
  uptime_seconds: number;
  checks: Record<string, ComponentCheck>;
  runtime?: {
    anthropic_pre_upstream?: { resolved_concurrency?: number; source?: string };
    compression_executor?: CompressionExecutor;
    websocket_sessions?: { active_sessions?: number; active_relay_tasks?: number };
  };
  rust_core?: string;
  deployment?: { profile?: string; preset?: string; runtime?: string; supervisor?: string; scope?: string };
}

// ---------------------------------------------------------------------------
// /stats-history (savings tracker)
// ---------------------------------------------------------------------------

/** Cumulative counters at one request that produced a saving. Deltas between points give per-request figures. */
export interface HistoryPoint {
  timestamp: string;
  provider?: string;
  model?: string;
  total_tokens_saved: number;
  compression_savings_usd: number;
  cache_read_tokens?: number;
  cache_savings_usd?: number;
  total_input_tokens: number;
  total_input_cost_usd: number;
  output_tokens_saved?: number;
  output_savings_usd?: number;
}

export interface SavingsLifetime {
  requests: number;
  tokens_saved: number;
  compression_savings_usd: number;
  cache_read_tokens: number;
  cache_savings_usd: number;
  total_input_tokens: number;
  total_input_cost_usd: number;
  output_tokens_saved?: number;
  output_savings_usd?: number;
}

export interface DisplaySession extends SavingsLifetime {
  savings_percent: number;
  started_at: string | null;
  last_activity_at: string | null;
}

export interface SavingsByModel {
  requests: number;
  tokens_saved: number;
  tool_tokens_saved?: number;
  compression_savings_usd: number;
  total_input_tokens: number;
  total_input_cost_usd: number;
  headline_tokens_saved?: number;
  savings_percent?: number;
}

export interface StatsHistoryResponse {
  schema_version: number;
  generated_at: string;
  lifetime: SavingsLifetime;
  display_session: DisplaySession;
  display_session_policy?: { rollover_inactivity_minutes?: number };
  history: HistoryPoint[];
  retention?: { max_history_points?: number; max_history_age_days?: number };
  by_model?: Record<string, SavingsByModel>;
  history_summary?: { mode: string; stored_points: number; returned_points: number; compacted: boolean };
}

// ---------------------------------------------------------------------------
// /stats-lifetime (persistent metrics)
// ---------------------------------------------------------------------------

export interface LifetimePrefixCache {
  requests: number;
  hit_requests: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  cache_write_5m_tokens?: number;
  cache_write_1h_tokens?: number;
  uncached_input_tokens: number;
  bust_count: number;
  bust_tokens: number;
  misses_by_reason?: Record<string, number>;
  by_provider?: Record<string, number>;
  cache_hit_rate: number | null;
  ttl_1h_percent?: number | null;
  ttl_5m_percent?: number | null;
}

export interface LifetimeModel {
  requests: number;
  input_tokens: number;
  output_tokens: number;
  attempted_input_tokens: number;
  tokens_saved: number;
  last_activity_at: string | null;
}

export interface StatsLifetimeResponse {
  scope: string;
  schema_version: number;
  generated_at: string;
  started_at: string | null;
  last_activity_at: string | null;
  full_fidelity_started_at?: string | null;
  requests: {
    total: number;
    cached: number;
    failed: number;
    rate_limited: number;
    by_provider?: Record<string, number>;
    by_stack?: Record<string, number>;
  };
  tokens: {
    input: number;
    output: number;
    attempted_input: number;
    saved: number;
    token_savings_percent: number;
  };
  prefix_cache: LifetimePrefixCache;
  cost: {
    input_usd: number;
    compression_savings_usd: number;
    cache_savings_usd: number;
  };
  waste_signals?: Record<string, number>;
  by_model?: Record<string, LifetimeModel>;
  persistence?: {
    enabled: boolean;
    healthy: boolean;
    error: string | null;
    pending_records?: number;
    last_saved_at?: string | null;
  };
}

// ---------------------------------------------------------------------------
// /stats (runtime, since the proxy process started)
// ---------------------------------------------------------------------------

export interface Timing {
  average_ms: number;
  min_ms?: number;
  max_ms: number;
  total_requests?: number;
  count?: number;
}

export interface AgentUsage {
  agent: string;
  label: string;
  source?: string;
  requests: number;
  before_tokens: number;
  after_tokens: number;
  output_tokens: number;
  tokens_saved: number;
  models?: Record<string, number>;
  providers?: Record<string, number>;
  has_exact_tokens?: boolean;
  savings_percent: number;
  after_percent?: number;
  share_of_saved_percent: number;
  share_of_requests_percent: number;
}

export interface PrefixCacheBucket {
  cache_read_tokens: number;
  cache_write_tokens: number;
  cache_write_5m_tokens?: number;
  cache_write_1h_tokens?: number;
  uncached_input_tokens: number;
  requests: number;
  hit_requests: number;
  hit_rate: number;
  request_hit_rate?: number;
  bust_count: number;
  bust_write_tokens?: number;
  read_discount?: string;
  write_premium?: string;
  savings_usd: number;
  write_premium_usd: number;
  net_savings_usd: number;
  label?: string;
  observed_ttl_mix?: { "5m_pct"?: number; "1h_pct"?: number };
}

export interface RecentRequest {
  request_id: string | null;
  timestamp: string | null;
  provider: string | null;
  model: string | null;
  input_tokens_original: number | null;
  input_tokens_optimized: number | null;
  output_tokens: number | null;
  tokens_saved: number | null;
  savings_percent: number | null;
  optimization_latency_ms: number | null;
  total_latency_ms: number | null;
  has_exact_tokens?: boolean;
  token_accounting_status?: string;
  transforms_applied?: string[];
  waste_signals?: Record<string, number> | null;
  tool_schema_saved_tokens?: number | null;
}

export interface StatsResponse {
  summary?: {
    mode?: string;
    api_requests?: number;
    primary_model?: string | null;
    compression?: {
      requests_compressed: number;
      avg_compression_pct: number;
      best_compression_pct: number;
      best_detail?: string | null;
      total_tokens_removed: number;
      total_tokens_before: number;
    };
    cost?: {
      without_headroom_usd: number;
      with_headroom_usd: number;
      total_saved_usd: number;
      savings_pct: number;
      breakdown?: { cache_savings_usd?: number; compression_savings_usd?: number };
    };
  };
  agent_usage?: {
    agents: AgentUsage[];
    totals: {
      requests: number;
      before_tokens: number;
      after_tokens: number;
      output_tokens: number;
      tokens_saved: number;
      savings_percent: number;
    };
    coverage?: { logged_requests?: number; exact_token_rows?: number; mode?: string };
  };
  requests?: {
    total: number;
    cached: number;
    rate_limited: number;
    failed: number;
    by_provider?: Record<string, number>;
    by_model?: Record<string, number>;
  };
  tokens?: {
    input: number;
    output: number;
    saved: number;
    total_before_compression?: number;
    savings_percent: number;
    active_savings_percent?: number;
    new_input_tokens?: number;
    new_input_savings_percent?: number;
  };
  latency?: Timing;
  overhead?: Timing;
  ttfb?: Timing;
  pipeline_timing?: Record<string, Timing>;
  compressions_by_strategy?: Record<string, number>;
  tokens_saved_by_strategy?: Record<string, number>;
  waste_signals?: Record<string, number>;
  router?: { route_counts?: Record<string, number> };
  display_session?: DisplaySession;
  prefix_cache?: {
    by_provider?: Record<string, PrefixCacheBucket>;
    totals?: PrefixCacheBucket;
    miss_attribution?: { totals?: Record<string, number> };
    prefix_freeze?: {
      busts_avoided: number;
      tokens_preserved: number;
      compression_foregone_tokens: number;
      net_benefit_tokens: number;
    };
    compression_vs_cache?: {
      tokens_saved_by_compression: number;
      tokens_lost_to_cache_bust: number;
      cache_bust_count: number;
      net_tokens: number;
    };
  };
  cost?: {
    total_input_cost_usd?: number;
    cost_with_headroom_usd?: number;
    savings_usd?: number;
    compression_savings_usd?: number;
    cache_savings_usd?: number;
    per_model?: Record<string, { requests: number; tokens_saved: number; tokens_sent: number; reduction_pct: number }>;
    budget_limit_usd?: number | null;
    budget_period?: string;
  };
  compression?: {
    ccr_entries: number;
    ccr_max_entries: number;
    original_tokens_cached: number;
    compressed_tokens_cached: number;
    ccr_retrievals: number;
  };
  toin?: {
    enabled: boolean;
    patterns_tracked: number;
    total_compressions: number;
    total_retrievals: number;
    global_retrieval_rate: number;
    patterns_with_recommendations: number;
  };
  cache?: { entries: number; max_entries: number; total_hits: number; ttl_seconds: number };
  rate_limiter?: { requests_per_minute: number; tokens_per_minute: number; active_keys: number };
  proxy_inbound?: {
    total: number;
    completed: number;
    active: number;
    by_status?: Record<string, number>;
  };
  throughput?: { current?: Record<string, number>; rolling?: Record<string, number> } | null;
  otel?: { enabled: boolean };
  langfuse?: { enabled: boolean };
  log_full_messages?: boolean;
  /** Present only for loopback or trusted dashboard clients. */
  recent_requests?: RecentRequest[];
}

// ---------------------------------------------------------------------------
// /subscription-window and /quota
// ---------------------------------------------------------------------------

export interface RateWindow {
  used: number;
  limit: number;
  utilization_pct: number;
  resets_at: string | null;
  seconds_to_reset: number | null;
  synthesized?: boolean;
  resets_at_estimated?: boolean;
  render_warning?: string;
}

export interface SubscriptionSnapshot {
  five_hour: RateWindow;
  seven_day: RateWindow;
  seven_day_opus?: RateWindow;
  seven_day_sonnet?: RateWindow;
  extra_usage?: {
    is_enabled: boolean;
    monthly_limit_usd: number | null;
    used_credits_usd: number | null;
    utilization_pct: number | null;
  };
  polled_at: string;
  token_prefix?: string;
}

export interface HeadroomContribution {
  tokens_submitted: number;
  tokens_saved: { compression: number; cache_reads: number; total: number };
  raw_without_headroom: number;
  efficiency_pct: number;
  savings_usd: { compression: number; cache: number; total: number };
}

export interface SubscriptionWindowResponse {
  latest: SubscriptionSnapshot | null;
  window_tokens: {
    input: number;
    output: number;
    cache_reads: number;
    cache_writes_total: number;
    total_raw: number;
    weighted_token_equivalent: number;
  } | null;
  contribution: HeadroomContribution;
  discrepancies?: Array<{ kind: string; description: string; severity: string; delta_pct: number | null }>;
  poll_count: number;
  poll_errors: number;
  last_error: string | null;
  last_active_at: string | null;
}

export interface CodexWindow {
  used_percent: number;
  window_minutes: number | null;
  window_label: string;
  resets_at: number | null;
  seconds_until_reset: number | null;
}

export interface CodexRateLimits {
  limit_id: string;
  limit_name: string | null;
  primary: CodexWindow | null;
  secondary: CodexWindow | null;
  credits: { has_credits: boolean; unlimited: boolean; balance: string | null } | null;
  promo_message?: string | null;
  captured_at: number;
}

export interface CopilotCategory {
  name: string;
  entitlement: number | null;
  remaining: number | null;
  used: number | null;
  percent_remaining: number | null;
  used_percent: number | null;
  overage_count: number;
  overage_permitted: boolean;
  unlimited: boolean;
}

export interface CopilotQuota {
  latest: {
    login: string | null;
    copilot_plan: string | null;
    access_type_sku?: string | null;
    quota_reset_date_utc: string | null;
    categories: Record<string, CopilotCategory>;
    fetched_at: number;
  } | null;
  last_error: string | null;
  last_updated: number | null;
}

/** Keyed by tracker; trackers without data are omitted. */
export interface QuotaResponse {
  subscription_window?: SubscriptionWindowResponse;
  codex_rate_limits?: CodexRateLimits;
  copilot_quota?: CopilotQuota;
  [key: string]: unknown;
}
