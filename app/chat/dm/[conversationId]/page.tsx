import DMPageClient from "./DMPageClient";

/**
 * Server wrapper that awaits dynamic params before rendering the client page.
 * @param {{ params: Promise<{ conversationId: string }> }} props
 */
export default async function DMPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  return <DMPageClient conversationId={conversationId} />;
}
