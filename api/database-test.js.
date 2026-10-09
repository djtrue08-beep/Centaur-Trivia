
import { createClient } from "@supabase/supabase-js";

export default async function handler(request, response) {
  if (request.method !== "GET") {
    return response.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_PUBLISHABLE_KEY
    );

    const { error } = await supabase
      .from("game_rooms")
      .select("id")
      .limit(1);

    if (error) {
      return response.status(200).json({
        server: "online",
        database: "query blocked",
        message: error.message
      });
    }

    return response.status(200).json({
      server: "online",
      database: "connected"
    });
  } catch (error) {
    return response.status(500).json({
      server: "online",
      database: "connection failed"
    });
  }
}
