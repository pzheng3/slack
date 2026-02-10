import { redirect } from "next/navigation";

/**
 * Root page — redirects to the default channel (#general).
 */
export default function Home() {
  redirect("/chat/channel/general");
}
