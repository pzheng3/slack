import ChannelPageClient from "./ChannelPageClient";

/**
 * Server wrapper that awaits dynamic params before rendering the client page.
 * @param {{ params: Promise<{ name: string }> }} props
 */
export default async function ChannelPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = await params;
  return <ChannelPageClient name={name} />;
}
