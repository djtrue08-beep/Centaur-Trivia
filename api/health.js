
export default function handler(request, response) {
  const hasUrl = Boolean(process.env.SUPABASE_URL);
  const hasKey = Boolean(
    process.env.SUPABASE_PUBLISHABLE_KEY
  );

  response.status(200).json({
    game: "Centaur Trivia",
    server: "online",
    supabaseConfigured: hasUrl && hasKey
  });
}
