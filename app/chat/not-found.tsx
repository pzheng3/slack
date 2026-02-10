/**
 * Shown when a chat route doesn't match any valid conversation.
 */
export default function ChatNotFound() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="text-center">
        <h2 className="text-lg font-semibold">Conversation not found</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          This conversation doesn&apos;t exist or you don&apos;t have access.
        </p>
      </div>
    </div>
  );
}
