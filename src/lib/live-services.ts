import * as Location from "expo-location";

export type Coordinates = { latitude: number; longitude: number };
export type LiveFixture = { league:string; home:string; away:string; time:string; score:string; status:string; sourceName:string };

const FOOTBALL_KEY = process.env.EXPO_PUBLIC_FOOTBALL_API_KEY ?? "";
const WEATHER_KEY = process.env.EXPO_PUBLIC_WEATHER_API_KEY ?? "";
const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ?? "";

export const liveServiceAvailability = {
  football: Boolean(FOOTBALL_KEY),
  weather: Boolean(WEATHER_KEY),
  mapbox: Boolean(MAPBOX_TOKEN),
};

async function readJson(response: Response, provider: string): Promise<any> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = body?.message || body?.error || `HTTP ${response.status}`;
    throw new Error(`${provider}: ${String(detail)}`);
  }
  return body;
}

export async function fetchLiveFootballFixtures(): Promise<LiveFixture[]> {
  if (!FOOTBALL_KEY) return [];
  const date = new Date().toISOString().slice(0, 10);
  const url = `https://v3.football.api-sports.io/fixtures?date=${date}&timezone=Africa%2FBlantyre`;
  const body = await readJson(await fetch(url, { headers: { "x-apisports-key": FOOTBALL_KEY } }), "Football provider");
  if (body.errors && Object.keys(body.errors).length) throw new Error("Football provider rejected the configured key or request.");
  return (body.response ?? []).map((item: any) => ({
    league: item.league?.name || "Football",
    home: item.teams?.home?.name || "Home",
    away: item.teams?.away?.name || "Away",
    time: item.fixture?.date ? new Date(item.fixture.date).toLocaleString() : "Time unavailable",
    score: item.goals?.home == null || item.goals?.away == null ? "— : —" : `${item.goals.home} : ${item.goals.away}`,
    status: item.fixture?.status?.long || "Scheduled",
    sourceName: "API-Football",
  }));
}

export async function requestDeviceCoordinates(): Promise<Coordinates> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== "granted") throw new Error("Location permission was denied. Allow location access in Android settings to use this feature.");
  const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  return { latitude: position.coords.latitude, longitude: position.coords.longitude };
}

export async function fetchWeather(coordinates: Coordinates): Promise<any> {
  if (!WEATHER_KEY) throw new Error("Weather API key is not configured in this Expo build.");
  const query = `lat=${coordinates.latitude}&lon=${coordinates.longitude}&appid=${encodeURIComponent(WEATHER_KEY)}&units=metric`;
  const body = await readJson(await fetch(`https://api.openweathermap.org/data/2.5/weather?${query}`), "Weather provider");
  return {
    place: body.name || "Current location",
    temperature: Math.round(Number(body.main?.temp)),
    feelsLike: Math.round(Number(body.main?.feels_like)),
    humidity: Number(body.main?.humidity),
    description: body.weather?.[0]?.description || "Current conditions",
    wind: Number(body.wind?.speed || 0),
  };
}

export async function searchMapboxPlaces(query: string): Promise<{name:string;latitude:number;longitude:number}[]> {
  if (!MAPBOX_TOKEN) throw new Error("Mapbox public token is not configured in this Expo build.");
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?country=mw&limit=5&access_token=${encodeURIComponent(MAPBOX_TOKEN)}`;
  const body = await readJson(await fetch(url), "Mapbox");
  return (body.features ?? []).map((feature: any) => ({
    name: feature.place_name || feature.text || "Selected place",
    longitude: Number(feature.center?.[0]),
    latitude: Number(feature.center?.[1]),
  })).filter((place: any) => Number.isFinite(place.latitude) && Number.isFinite(place.longitude));
}

export function mapboxStaticImageUrl(coordinates: Coordinates): string {
  if (!MAPBOX_TOKEN) return "";
  const { latitude, longitude } = coordinates;
  return `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/pin-s+ef7b25(${longitude},${latitude})/${longitude},${latitude},11/900x520?access_token=${encodeURIComponent(MAPBOX_TOKEN)}`;
}
