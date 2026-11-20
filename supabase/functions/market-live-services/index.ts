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

  let input: { action?: string; latitude?: number; longitude?: number; season?: number; leagueId?: number };
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

  if (input.action === "standings") {
    const key = Deno.env.get("FOOTBALL_API_KEY");
    if (!key) return json({ error: "Football provider secret is not configured" }, 503);
    const headers = { "x-apisports-key": key };
    const requestedSeason = Number.isInteger(input.season) && Number(input.season) >= 2000 && Number(input.season) <= 2100
      ? Number(input.season) : null;
    let leagueId = Number(input.leagueId) || 0;
    let selectedSeason = requestedSeason;
    if (!Number.isInteger(leagueId) || leagueId < 1) {
      const leaguesUrl = new URL("https://v3.football.api-sports.io/leagues");
      leaguesUrl.searchParams.set("country", "Malawi");
      if (requestedSeason) leaguesUrl.searchParams.set("season", String(requestedSeason));
      else leaguesUrl.searchParams.set("current", "true");
      const leaguesResponse = await fetch(leaguesUrl, { headers });
      const leaguesBody = await leaguesResponse.json().catch(() => ({}));
      if (!leaguesResponse.ok || (leaguesBody.errors && Object.keys(leaguesBody.errors).length)) {
        return json({ error: "Could not find Malawi football competitions", details: leaguesBody.errors ?? leaguesBody.message ?? leaguesResponse.status }, 502);
      }
      const competition = (leaguesBody.response ?? []).find((item: any) =>
        item.country?.name?.toLowerCase() === "malawi" &&
        /super league/i.test(item.league?.name ?? "") &&
        item.league?.type === "League" &&
        (item.seasons ?? []).some((season: any) => (!requestedSeason || Number(season.year) === requestedSeason) && season.coverage?.standings === true && (!requestedSeason ? season.current === true : true))
      );
      if (!competition) return json({ error: "No Malawi Super League standings are available for the requested season." }, 404);
      leagueId = Number(competition.league.id);
      const season = (competition.seasons ?? []).find((item: any) => Number(item.year) === requestedSeason && item.coverage?.standings === true)
        ?? (competition.seasons ?? []).find((item: any) => item.current === true && item.coverage?.standings === true);
      selectedSeason = Number(season?.year);
    }
    if (!selectedSeason || !Number.isInteger(selectedSeason)) return json({ error: "A supported football season could not be determined." }, 404);
    const standingsUrl = new URL("https://v3.football.api-sports.io/standings");
    standingsUrl.searchParams.set("league", String(leagueId));
    standingsUrl.searchParams.set("season", String(selectedSeason));
    const standingsResponse = await fetch(standingsUrl, { headers });
    const standingsBody = await standingsResponse.json().catch(() => ({}));
    if (!standingsResponse.ok || (standingsBody.errors && Object.keys(standingsBody.errors).length)) {
      return json({ error: "Football standings provider request failed", details: standingsBody.errors ?? standingsBody.message ?? standingsResponse.status }, 502);
    }
    const league = standingsBody.response?.[0]?.league;
    const groups = league?.standings ?? [];
    const rows = groups.flat().map((item: any) => ({
      id: String(item.team?.id ?? item.rank),
      competition: league?.name || "Malawi Super League",
      season: String(league?.season ?? selectedSeason),
      team_name: item.team?.name || "Team",
      played: Number(item.all?.played ?? 0),
      won: Number(item.all?.win ?? 0),
      drawn: Number(item.all?.draw ?? 0),
      lost: Number(item.all?.lose ?? 0),
      goals_for: Number(item.all?.goals?.for ?? 0),
      goals_against: Number(item.all?.goals?.against ?? 0),
      points: Number(item.points ?? 0),
      position: Number(item.rank ?? 0),
      source_name: "API-Football",
      source_url: "https://www.api-football.com/",
    }));
    return json({ standings: rows, competition: league?.name ?? "Malawi Super League", season: league?.season ?? selectedSeason, source: "API-Football" });
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