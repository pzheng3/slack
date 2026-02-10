/**
 * Seed script — run with `npx tsx lib/supabase/seed.ts`
 * Creates the initial channels and agent users if they don't exist.
 * Requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY env vars.
 */
import { createClient } from "@supabase/supabase-js";
import { AGENTS, CHANNELS, GENERIC_AGENT } from "../constants";

async function seed() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY"
    );
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Seed agent users (predefined + generic)
  const allAgents = [...AGENTS, GENERIC_AGENT];
  for (const agent of allAgents) {
    const { error } = await supabase.from("users").upsert(
      {
        username: agent.username,
        avatar_url: agent.avatar_url,
        is_agent: true,
      },
      { onConflict: "username" }
    );
    if (error) {
      console.error(`Failed to seed agent "${agent.username}":`, error.message);
    } else {
      console.log(`Seeded agent: ${agent.username}`);
    }
  }

  // Seed channels
  for (const channelName of CHANNELS) {
    // Check if channel already exists
    const { data: existing } = await supabase
      .from("conversations")
      .select("id")
      .eq("type", "channel")
      .eq("name", channelName)
      .single();

    if (!existing) {
      const { error } = await supabase
        .from("conversations")
        .insert({ type: "channel", name: channelName });
      if (error) {
        console.error(
          `Failed to seed channel "#${channelName}":`,
          error.message
        );
      } else {
        console.log(`Seeded channel: #${channelName}`);
      }
    } else {
      console.log(`Channel #${channelName} already exists`);
    }
  }

  console.log("Seed complete!");
}

seed();
