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

let newsCache: { savedAt:number; articles:any[] } | null = null;
function decodeRss(value:string){
  return value.replace(/<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>/g,"$1").replace(/<[^>]*>/g," ")
    .replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"')
    .replace(/&#39;/g,"'").replace(/&#(\\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).replace(/\\s+/g," ").trim();
}
function rssTag(xml:string,name:string){
  const match=xml.match(new RegExp("<"+name+"(?:\\\\s[^>]*)?>([\\\\s\\\\S]*?)</"+name+">","i"));
  return match?decodeRss(match[1]):"";
}
function rssImage(item:string){
  const media=item.match(/<(?:media:content|media:thumbnail|enclosure)\\b[^>]*\\burl=["']([^"']+)["'][^>]*>/i)?.[1];
  const inline=item.match(/<img\\b[^>]*\\bsrc=["']([^"']+)["'][^>]*>/i)?.[1];
  for(const value of [media,inline]){
    if(!value)continue;
    try{const url=new URL(value.trim().replace(/&amp;/g,"&"));if(url.protocol==="https:")return url.toString();}catch{}
  }
  return undefined;
}
async function fetchRssFeed(feed:{url:string;category:string;source:string}){
  const response=await fetch(feed.url,{headers:{"User-Agent":"MalawiMarket/1.0","Accept":"application/rss+xml, application/xml, text/xml"}});
  if(!response.ok)throw new Error("RSS HTTP "+response.status);
  const xml=await response.text();
  return [...xml.matchAll(/<item\\b[\\s\\S]*?<\\/item>/gi)].map(match=>{
    const item=match[0],date=rssTag(item,"pubDate"),parsed=new Date(date),link=rssTag(item,"link");
    return {title:rssTag(item,"title"),summary:rssTag(item,"description").slice(0,480),image_url:rssImage(item),category:feed.category,source_name:feed.source,source_url:link,published_at:Number.isNaN(parsed.getTime())?new Date().toISOString():parsed.toISOString()};
  }).filter(item=>item.title.length>4&&/^https:\\/\\//i.test(item.source_url));
}

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

  if (input.action === "news") {
    if (newsCache && Date.now() - newsCache.savedAt < 10 * 60 * 1000) {
      return json({ articles: newsCache.articles, cached: true, updated_at: new Date(newsCache.savedAt).toISOString() });
    }
    const feeds = [
      { url:"https://malawi24.com/feed/", category:"Malawi", source:"Malawi24" },
      { url:"https://malawi24.com/business/feed/", category:"Business", source:"Malawi24" },
      { url:"https://feeds.bbci.co.uk/news/world/africa/rss.xml", category:"Africa", source:"BBC News" },
      { url:"https://feeds.bbci.co.uk/news/world/rss.xml", category:"World", source:"BBC News" },
      { url:"https://feeds.bbci.co.uk/news/business/rss.xml", category:"Business", source:"BBC News" },
      { url:"https://feeds.bbci.co.uk/news/technology/rss.xml", category:"Technology", source:"BBC News" },
      { url:"https://feeds.bbci.co.uk/sport/rss.xml", category:"Sports", source:"BBC Sport" },
    ];
    const results = await Promise.allSettled(feeds.map(fetchRssFeed));
    const articles = Array.from(new Map(results.flatMap(result => result.status === "fulfilled" ? result.value : []).map(item => [item.source_url,item])).values())
      .sort((a,b)=>new Date(b.published_at).getTime()-new Date(a.published_at).getTime()).slice(0,40);
    if (!articles.length) return json({ error:"No live news articles could be retrieved from the configured feeds." },502);
    newsCache = { savedAt:Date.now(), articles };
    return json({ articles, cached:false, updated_at:new Date(newsCache.savedAt).toISOString() });
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
    const forecastUrl = new URL("https://api.openweathermap.org/data/2.5/forecast");
    forecastUrl.searchParams.set("lat", String(latitude));
    forecastUrl.searchParams.set("lon", String(longitude));
    forecastUrl.searchParams.set("appid", key);
    forecastUrl.searchParams.set("units", "metric");
    const [upstream, forecastUpstream] = await Promise.all([fetch(url), fetch(forecastUrl)]);
    const body = await upstream.json().catch(() => ({}));
    const forecastBody = await forecastUpstream.json().catch(() => ({}));
    if (!upstream.ok) return json({ error: "Weather provider request failed", details: body.message ?? upstream.status }, 502);
    const offsetSeconds = Number(forecastBody.city?.timezone ?? body.timezone ?? 0);
    const grouped = new Map<string, any>();
    for (const entry of (forecastBody.list ?? [])) {
      const timestamp = Number(entry.dt);
      if (!Number.isFinite(timestamp)) continue;
      const date = new Date((timestamp + offsetSeconds) * 1000).toISOString().slice(0, 10);
      const hour = new Date((timestamp + offsetSeconds) * 1000).getUTCHours();
      const item = grouped.get(date) ?? {
        date,
        min: Number(entry.main?.temp_min ?? entry.main?.temp),
        max: Number(entry.main?.temp_max ?? entry.main?.temp),
        description: entry.weather?.[0]?.description || "Forecast",
        icon: entry.weather?.[0]?.icon || "",
        precipitation: Number(entry.pop ?? 0),
        representativeHourDistance: Math.abs(hour - 12),
      };
      item.min = Math.min(item.min, Number(entry.main?.temp_min ?? entry.main?.temp));
      item.max = Math.max(item.max, Number(entry.main?.temp_max ?? entry.main?.temp));
      item.precipitation = Math.max(item.precipitation, Number(entry.pop ?? 0));
      if (Math.abs(hour - 12) < item.representativeHourDistance) {
        item.description = entry.weather?.[0]?.description || item.description;
        item.icon = entry.weather?.[0]?.icon || item.icon;
        item.representativeHourDistance = Math.abs(hour - 12);
      }
      grouped.set(date, item);
    }
    const forecast = Array.from(grouped.values()).slice(0, 5).map(({ representativeHourDistance, ...item }) => ({
      ...item,
      min: Math.round(item.min),
      max: Math.round(item.max),
      precipitation: Math.round(item.precipitation * 100),
    }));
    return json({
      weather: {
        place: body.name || "Current location",
        temperature: Math.round(Number(body.main?.temp)),
        feelsLike: Math.round(Number(body.main?.feels_like)),
        humidity: Number(body.main?.humidity),
        description: body.weather?.[0]?.description || "Current conditions",
        wind: Number(body.wind?.speed || 0),
        forecast,
        forecastUnavailable: !forecastUpstream.ok,
      },
    });
  }

  return json({ error: "Unsupported action" }, 400);
}));