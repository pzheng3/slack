import SessionPageClient from "./SessionPageClient";

/**
 * Server wrapper that awaits dynamic params before rendering the client page.
 * @param {{ params: Promise<{ sessionId: string }> }} props
 */
export default async function SessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return <SessionPageClient sessionId={sessionId} />;
}
