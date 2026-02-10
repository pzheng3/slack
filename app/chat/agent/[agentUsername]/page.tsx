import AgentPageClient from "./AgentPageClient";

/**
 * Server wrapper that awaits dynamic params before rendering the client page.
 * @param {{ params: Promise<{ agentUsername: string }> }} props
 */
export default async function AgentPage({
  params,
}: {
  params: Promise<{ agentUsername: string }>;
}) {
  const { agentUsername } = await params;
  return (
    <AgentPageClient agentUsername={decodeURIComponent(agentUsername)} />
  );
}
