export async function GET() {
  return Response.json(
    {
      status: "ok",
      version: "0.4.1",
      cloudConfigured: !!(
        process.env.NEXT_PUBLIC_SUPABASE_URL &&
        (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
      ),
      authenticationRequired: true,
      exampleData: false,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
