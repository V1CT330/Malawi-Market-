import * as Location from "expo-location";
import { supabase } from "./supabase";

export type Coordinates = { latitude: number; longitude: number };
export type LiveFixture = { league:string; home:string; away:string; time:string; score:string; status:string; sourceName:string };

const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ?? "";

export const liveServiceAvailability = {
  football: true,
  weather: true,
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
  const { data, error } = await supabase.functions.invoke("market-live-services", {
    body: { action: "football" },
  });
  if (error) throw new Error(error.message || "Could not load football fixtures.");
  if (data?.error) throw new Error(data.error);
  return Array.isArray(data?.fixtures) ? data.fixtures : [];
}

export async function requestDeviceCoordinates(): Promise<Coordinates> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== "granted") throw new Error("Location permission was denied. Allow location access in Android settings to use this feature.");
  const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  return { latitude: position.coords.latitude, longitude: position.coords.longitude };
}

export async function fetchWeather(coordinates: Coordinates): Promise<any> {
  const { data, error } = await supabase.functions.invoke("market-live-services", {
    body: { action: "weather", latitude: coordinates.latitude, longitude: coordinates.longitude },
  });
  if (error) throw new Error(error.message || "Could not load weather.");
  if (data?.error) throw new Error(data.error);
  return data?.weather;
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
