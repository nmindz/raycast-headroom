# Headroom Savings

Compression savings, provider prefix-cache discount, quota and health metrics from your own [Headroom](https://github.com/headroomlabs-ai/headroom) proxy, in Raycast. It answers questions such as:

- How much did Headroom's compression save me today, and what did the input cost?
- How much did the provider's prompt cache discount, and how often does it hit?
- Which model, strategy or client agent saves the most tokens?
- How close am I to my Claude 5-hour and 7-day limits?
- Is the proxy (or its container) healthy?

Every figure comes from Headroom's own HTTP endpoints; nothing is stored outside Headroom.

## Install

Not on the Raycast Store. Register it with every Raycast app on this Mac; no Raycast account or long-running dev server needed:

```bash
make install
```

| App                    | Bundle id             | Extensions folder                         | How it registers                                                                   |
| ---------------------- | --------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------- |
| Raycast 2 (retail 2.x) | `com.raycast.macos`   | `~/.config/raycast/extensions/headroom`   | a short `ray develop` session with the project's CLI                               |
| Raycast 1              | `com.raycast.macos`   | `~/.config/raycast/extensions/headroom`   | `ray build` into the folder, then a restart (Raycast 1 scans it at launch)         |
| Raycast Beta           | `com.raycast-x.macos` | `~/.config/raycast-x/extensions/headroom` | a short `ray develop` session with the Raycast Beta CLI (`@raycast/api@latest-v0`) |

The script reads the version of `com.raycast.macos` to tell Raycast 2 from Raycast 1. Raycast 2 and Raycast Beta only register a local extension through the develop handshake (a `raycast://cli/…` deep link that also launches the app if needed), so they are never restarted; the session stops after the first successful build and the extension stays installed. `make install` runs `pnpm install --frozen-lockfile` first when `node_modules` is missing or older than `pnpm-lock.yaml`. Run it again after pulling changes. `make uninstall` removes the build from every folder and restarts the running apps; `make restart-raycast` only restarts them.

Without `make`: `pnpm install --frozen-lockfile && pnpm run install-local`.

## Setup

Open any command of this extension. Raycast asks for the preferences below.

| Preference    | Description                                                                                                                                        |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Headroom URL  | Base URL of the proxy: scheme, host and port. Defaults to `http://127.0.0.1:41090`.                                                                |
| Proxy Token   | Optional. Only when Headroom runs with `HEADROOM_PROXY_TOKEN` (or `--proxy-token`); sent as `X-Headroom-Proxy-Token`. Health probes never need it. |
| Time Zone     | Optional IANA zone (for example `America/Sao_Paulo`) that defines "today", weeks and months. Empty uses the system time zone.                      |
| Quota Display | Show subscription quota as consumed or remaining percentage.                                                                                       |

### Headroom in Docker

Point **Headroom URL** at the host port the container publishes, not the port inside the container. For a container started with `-p 41090:41090` (`docker ps` shows `0.0.0.0:41090->41090/tcp`) that is `http://127.0.0.1:41090`; for another host or port, change the URL accordingly (`http://<host>:<published port>`).

From inside the container, requests from your Mac are not loopback. Headroom therefore strips per-request metadata from `/stats`, so **Recent Requests** stays empty until Headroom trusts the address it sees your Mac connect from:

```bash
# The peer address the container sees: the bridge gateway (OrbStack: 192.168.215.1, Docker's default bridge: 172.17.0.1)
docker network inspect bridge --format '{{(index .IPAM.Config 0).Gateway}}'

# Recreate the container with the trust list (keep your other flags and env vars)
docker run … -e HEADROOM_PROXY_TRUSTED_DASHBOARD_CLIENT_CIDRS=192.168.215.1/32 …
```

The trust list also requires an IP address in the URL's host (`127.0.0.1`, not `localhost`). It unlocks per-request metadata only; Headroom's loopback-only admin and debug endpoints stay closed, and this extension does not use them.

## Commands

| Command             | What it shows                                                                                                                                                                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Savings Overview    | Today, yesterday, last 7 days, this week, last week, this month, last month and last 30 days with trends against the previous period, plus the current session, the running proxy and lifetime. Drill into hourly/daily series and models. |
| Model Savings       | Ranking by compression savings, cache discount, input cost, tokens saved or requests for a period or lifetime.                                                                                                                             |
| Prefix Cache        | Cache discount for a period (total, by model, by day), and token/request hit rate, cache writes by TTL, busts, miss reasons and the compression-versus-cache trade-off since the proxy started and over the lifetime.                      |
| Compression Stats   | Tokens saved, compression ratios, strategies, router decisions, waste signals, CCR and TOIN retrieval, pipeline stage timing.                                                                                                              |
| Agent Usage         | Tokens before and after compression, tokens saved and models per client agent (Claude Code, Codex, …) since the proxy started.                                                                                                             |
| Subscription Quotas | Anthropic 5-hour, 7-day and per-model windows with reset times, extra usage and Headroom's contribution in the current window; OpenAI Codex and GitHub Copilot quotas when Headroom tracks them.                                           |
| Recent Requests     | The last 25 requests with tokens before and after optimization, transforms, waste signals and latency (see [Headroom in Docker](#headroom-in-docker)).                                                                                     |
| Proxy Health        | Readiness and per-component checks, version, uptime, deployment, latency, overhead, time to first byte, compression executor, inbound HTTP status codes and persistence.                                                                   |
| Headroom Menu Bar   | Today's savings, the session, lifetime, proxy status and Anthropic windows, refreshed every 5 minutes.                                                                                                                                     |

### Menu bar

The **Menu Bar Title** command preference chooses what appears next to the icon:

| Option                                 | Title              |
| -------------------------------------- | ------------------ |
| Today's Compression Savings (default)  | `$26.80`           |
| Today's Compression Savings and Tokens | `$26.80 · 6.84M`   |
| Today's Cache Discount                 | `cache $2,471.22`  |
| Today's Combined Savings               | `saved $2,498.02`  |
| Today's Input Cost                     | `cost $431.81`     |
| Today's Token Savings Percent          | `1.07% saved`      |
| Session Compression Savings            | `session $21.80`   |
| Lifetime Compression Savings           | `lifetime $773.66` |
| Cache Hit Rate                         | `hit 89.7%`        |
| Anthropic 5-Hour / 7-Day Quota         | `5h 64%`, `7d 41%` |
| Anthropic 5-Hour and 7-Day Quota       | `5h 64% · 7d 41%`  |
| None                                   | icon only          |

Quota titles follow **Quota Display** (`… left` when it is set to remaining) and are empty while Headroom has no Anthropic usage snapshot. The icon turns red when Headroom reports itself unhealthy or cannot be reached.

## How the figures are computed

- **Compression savings** are the input tokens Headroom removed before forwarding, priced at each model's input rate. This is Headroom's own saving and the headline everywhere, as in Headroom's dashboard.
- **Provider cache discount** is the prefix-cache discount Anthropic or OpenAI applied, as Headroom observes it in responses. Caching is the provider's; Headroom's CacheAligner and prefix freeze keep prefixes stable to raise the hit rate. **Combined savings** adds both (and output shaping when enabled).
- **Cost without Headroom** is the input cost plus compression savings. Costs are USD estimates from Headroom's price table, not an invoice.
- **Periods** come from `/stats-history`: Headroom stores one cumulative checkpoint per request that saved anything, and the extension turns consecutive checkpoints into per-request deltas, bucketed in your time zone. Headroom keeps a bounded number of checkpoints (5,000 by default, at most 365 days), so busy proxies only cover the last few days; a period that starts earlier is marked partial (yellow icon) and its trend is hidden. In periods, **Requests With Savings** counts checkpoints, not every request.
- **Current Session** is Headroom's display session, which rolls over after an hour without requests. **Since Proxy Start** counters reset when Headroom restarts. **Lifetime** figures are persisted by Headroom.

Endpoints read: `/livez`, `/readyz`, `/stats?cached=1`, `/stats-lifetime`, `/stats-history?history_mode=full`, `/subscription-window` and `/quota`. `/readyz` lets Headroom HEAD-probe its upstream at most every 30 seconds; `/subscription-window` may trigger one Anthropic usage poll, which Headroom limits to one a minute.

## AI

With Raycast AI you can ask `@headroom`:

- "How much did Headroom save me today?"
- "Which model saved the most this week?"
- "What's my prefix cache hit rate?"
- "Which compression strategy saves the most tokens?"
- "How close am I to my Claude 5-hour limit?"
- "Is the proxy healthy?"

Tools: `get-savings-summary`, `get-model-savings`, `get-prefix-cache-stats`, `get-compression-stats`, `get-agent-usage`, `get-subscription-quota`, `get-proxy-health` and `get-recent-requests`. Window tools accept a `period` preset (plus `session` or `lifetime` where it applies) or explicit `startDate` / `endDate`.

## Troubleshooting

- **Cannot Reach Headroom**: check the URL preference (the published host port for Docker) and that the proxy or its container is running.
- **Proxy Token Required**: Headroom runs with `HEADROOM_PROXY_TOKEN`; set the same value in **Proxy Token**.
- **Endpoint Not Available**: the Headroom version predates the endpoint, or the endpoint is restricted to loopback callers.
- **Subscription quotas empty**: Headroom polls Anthropic's usage API with the Claude subscription (OAuth) credentials it forwards. A proxy that forwards with an API key or to another gateway has no subscription data; the command shows Headroom's last poll error.
- **Recent Requests empty**: see [Headroom in Docker](#headroom-in-docker).
- **Partial data**: the period starts before Headroom's oldest stored checkpoint.

## Development

```bash
pnpm install
pnpm run dev
pnpm run build
pnpm run lint
```
