import { withSupabase } from "npm:@supabase/server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(withSupabase({ auth: "user" }, async (req, _ctx) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let input: { action?: string; latitude?: number; longitude?: number };
  try {
    input = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  if (input.action === "football") {
    const key = Deno.env.get("FOOTBALL_API_KEY");
    if (!key) return json({ error: "Football provider secret is not configured" }, 503);
    const date = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Blantyre" });
    const url = new URL("https://v3.football.api-sports.io/fixtures");
    url.searchParams.set("date", date);
    url.searchParams.set("timezone", "Africa/Blantyre");
    const upstream = await fetch(url, { headers: { "x-apisports-key": key } });
    const body = await upstream.json().catch(() => ({}));
    if (!upstream.ok || (body.errors && Object.keys(body.errors).length)) {
      return json({ error: "Football provider request failed", details: body.errors ?? body.message ?? upstream.status }, 502);
    }
    const fixtures = (body.response ?? []).map((item: any) => ({
      league: item.league?.name || "Football",
      home: item.teams?.home?.name || "Home",
      away: item.teams?.away?.name || "Away",
      time: item.fixture?.date ? new Date(item.fixture.date).toLocaleString("en-GB", { timeZone: "Africa/Blantyre" }) : "Time unavailable",
      score: item.goals?.home == null || item.goals?.away == null ? "— : —" : `${item.goals.home} : ${item.goals.away}`,
      status: item.fixture?.status?.long || "Scheduled",
      sourceName: "API-Football",
    }));
    return json({ fixtures });
  }

  if (input.action === "weather") {
    const key = Deno.env.get("WEATHER_API_KEY");
    const { latitude, longitude } = input;
    if (!key) return json({ error: "Weather provider secret is not configured" }, 503);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) ||
        latitude! < -90 || latitude! > 90 || longitude! < -180 || longitude! > 180) {
      return json({ error: "Valid latitude and longitude are required" }, 400);
    }
    const url = new URL("https://api.openweathermap.org/data/2.5/weather");
    url.searchParams.set("lat", String(latitude));
    url.searchParams.set("lon", String(longitude));
    url.searchParams.set("appid", key);
    url.searchParams.set("units", "metric");
    const upstream = await fetch(url);
    const body = await upstream.json().catch(() => ({}));
    if (!upstream.ok) return json({ error: "Weather provider request failed", details: body.message ?? upstream.status }, 502);
    return json({
      weather: {
        place: body.name || "Current location",
        temperature: Math.round(Number(body.main?.temp)),
        feelsLike: Math.round(Number(body.main?.feels_like)),
        humidity: Number(body.main?.humidity),
        description: body.weather?.[0]?.description || "Current conditions",
        wind: Number(body.wind?.speed || 0),
      },
    });
  }

  return json({ error: "Unsupported action" }, 400);
}));