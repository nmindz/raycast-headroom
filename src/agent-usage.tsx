import { Color, Icon, List } from "@raycast/api";
import type { AgentUsage } from "./api/types";
import { headlineMarkdown } from "./components/detail";
import { ErrorEmptyView, NoDataEmptyView, StandardActions } from "./components/StandardActions";
import { useStats } from "./hooks/useHeadroom";
import { formatInt, formatPercent, formatTokens, humanizeKey, progressBar } from "./lib/format";

const M = List.Item.Detail.Metadata;

const CAPTION = "Since the proxy process started";

export default function AgentUsageCommand() {
  const { data, isLoading, error, revalidate } = useStats();
  const usage = data?.agent_usage;
  const agents = [...(usage?.agents ?? [])].sort((a, b) => b.tokens_saved - a.tokens_saved);
  // Headroom can attribute one client under two ids (e.g. "claude" from the client, "claude-code" from the model).
  const labelCounts: Record<string, number> = {};
  for (const agent of agents) labelCounts[agent.label] = (labelCounts[agent.label] ?? 0) + 1;

  return (
    <List isLoading={isLoading} isShowingDetail={agents.length > 0} searchBarPlaceholder="Search agents and models">
      {error && !data ? (
        <ErrorEmptyView error={error} revalidate={revalidate} />
      ) : data && (!usage || agents.length === 0) ? (
        <NoDataEmptyView
          title="No Agent Traffic"
          description="Headroom has not attributed any request to a client agent since it started."
        />
      ) : (
        usage && (
          <>
            <List.Section title="Total">
              <List.Item
                title="All Agents"
                icon={Icon.BarChart}
                accessories={[{ text: `${formatTokens(usage.totals.tokens_saved)} saved` }]}
                detail={
                  <List.Item.Detail
                    markdown={headlineMarkdown(
                      `${formatTokens(usage.totals.tokens_saved)} tokens saved`,
                      `${CAPTION} · ${formatInt(usage.totals.requests)} requests${
                        usage.coverage
                          ? ` · ${formatInt(usage.coverage.exact_token_rows)} of ${formatInt(usage.coverage.logged_requests)} with exact token counts`
                          : ""
                      }`,
                    )}
                    metadata={
                      <M>
                        <M.Label title="Requests" text={formatInt(usage.totals.requests)} />
                        <M.Label title="Tokens Before Compression" text={formatTokens(usage.totals.before_tokens)} />
                        <M.Label title="Tokens Sent" text={formatTokens(usage.totals.after_tokens)} />
                        <M.Label
                          title="Tokens Saved"
                          text={{ value: formatTokens(usage.totals.tokens_saved), color: Color.Green }}
                        />
                        <M.Label title="Savings" text={formatPercent(usage.totals.savings_percent, 2)} />
                        <M.Label title="Output Tokens" text={formatTokens(usage.totals.output_tokens)} />
                      </M>
                    }
                  />
                }
                actions={<StandardActions revalidate={revalidate} json={usage} />}
              />
            </List.Section>
            <List.Section title="Agents" subtitle="ranked by tokens saved">
              {agents.map((agent) => {
                const duplicate = labelCounts[agent.label] > 1;
                const title = !agent.label
                  ? humanizeKey(agent.agent)
                  : duplicate
                    ? `${agent.label} (${agent.agent})`
                    : agent.label;
                return (
                  <AgentItem
                    key={`${agent.agent}-${agent.source ?? ""}`}
                    agent={agent}
                    title={title}
                    revalidate={revalidate}
                  />
                );
              })}
            </List.Section>
          </>
        )
      )}
    </List>
  );
}

function AgentItem({ agent, title, revalidate }: { agent: AgentUsage; title: string; revalidate: () => void }) {
  const models = Object.entries(agent.models ?? {}).sort(([, a], [, b]) => b - a);
  const providers = Object.entries(agent.providers ?? {}).sort(([, a], [, b]) => b - a);
  return (
    <List.Item
      title={title}
      subtitle={formatPercent(agent.share_of_requests_percent)}
      icon={Icon.Terminal}
      keywords={[agent.agent, ...models.map(([model]) => model)]}
      accessories={[
        { text: `${formatInt(agent.requests)} req` },
        { text: `${formatTokens(agent.tokens_saved)} saved`, tooltip: "Tokens saved" },
      ]}
      detail={
        <List.Item.Detail
          markdown={headlineMarkdown(
            `${formatTokens(agent.tokens_saved)} tokens saved`,
            `**${title}** · ${CAPTION}${agent.has_exact_tokens === false ? "\n\nToken counts for this agent are estimated." : ""}`,
          )}
          metadata={
            <M>
              <M.Label
                title="Savings"
                text={`${progressBar(agent.savings_percent)} ${formatPercent(agent.savings_percent, 2)}`}
              />
              <M.Label
                title="Share of Requests"
                text={`${progressBar(agent.share_of_requests_percent)} ${formatPercent(agent.share_of_requests_percent)}`}
              />
              <M.Label
                title="Share of Tokens Saved"
                text={`${progressBar(agent.share_of_saved_percent)} ${formatPercent(agent.share_of_saved_percent)}`}
              />
              <M.Separator />
              <M.Label title="Requests" text={formatInt(agent.requests)} />
              <M.Label title="Tokens Before Compression" text={formatTokens(agent.before_tokens)} />
              <M.Label title="Tokens Sent" text={formatTokens(agent.after_tokens)} />
              <M.Label title="Tokens Saved" text={{ value: formatTokens(agent.tokens_saved), color: Color.Green }} />
              <M.Label title="Output Tokens" text={formatTokens(agent.output_tokens)} />
              {agent.source && <M.Label title="Detected From" text={agent.source} />}
              {models.length > 0 && (
                <M.TagList title="Models">
                  {models.map(([model, count]) => (
                    <M.TagList.Item key={model} text={`${model} · ${formatInt(count)}`} />
                  ))}
                </M.TagList>
              )}
              {providers.length > 0 && (
                <M.TagList title="Providers">
                  {providers.map(([provider, count]) => (
                    <M.TagList.Item key={provider} text={`${provider} · ${formatInt(count)}`} />
                  ))}
                </M.TagList>
              )}
            </M>
          }
        />
      }
      actions={<StandardActions revalidate={revalidate} json={agent} />}
    />
  );
}
