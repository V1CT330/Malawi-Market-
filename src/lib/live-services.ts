import * as Location from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";

export type Coordinates = { latitude: number; longitude: number };
export function parseCoordinatesFromMapInput(value:string):Coordinates|null {
  const input=value.trim();
  if(!input)return null;
  const candidates=[
    input.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/i),
    input.match(/@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/),
    input.match(/[?&](?:q|query|destination|ll)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/i),
    input.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/)
  ];
  for(const match of candidates){
    if(!match)continue;
    const latitude=Number(match[1]),longitude=Number(match[2]);
    if(Number.isFinite(latitude)&&Number.isFinite(longitude)&&latitude>=-90&&latitude<=90&&longitude>=-180&&longitude<=180)return {latitude,longitude};
  }
  return null;
}

export type LiveFixture = { league:string; home:string; away:string; time:string; score:string; status:string; sourceName:string };

export type ExchangeRate = { currency:string; mwkPerUnit:number };
export type ExchangeRateSnapshot = { updatedAt:string; rates:ExchangeRate[] };

export async function fetchExchangeRates():Promise<ExchangeRateSnapshot> {
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),15000);
  try {
    const response=await fetch("https://open.er-api.com/v6/latest/USD",{signal:controller.signal});
    const body=await readJson(response,"Exchange-rate provider");
    if(body?.result!=="success"||!body?.rates||!Number.isFinite(Number(body.rates.MWK))) {
      throw new Error("The exchange-rate provider returned an invalid response.");
    }
    const currencies=["USD","GBP","EUR","ZAR","KES","TZS","BWP"];
    const rates=currencies.map(currency=>{
      const foreignPerUsd=currency==="USD"?1:Number(body.rates[currency]);
      const mwkPerUsd=Number(body.rates.MWK);
      return {currency,mwkPerUnit:mwkPerUsd/foreignPerUsd};
    }).filter(rate=>Number.isFinite(rate.mwkPerUnit)&&rate.mwkPerUnit>0);
    if(!rates.length)throw new Error("No usable exchange rates were returned.");
    return {updatedAt:body.time_last_update_utc||new Date().toISOString(),rates};
  } finally {
    clearTimeout(timeout);
  }
}

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

const LOCATION_PERMISSION_REQUESTED_KEY = "@malawi-market/permissions/location-requested";

export async function requestDeviceCoordinates(): Promise<Coordinates> {
  let permission = await Location.getForegroundPermissionsAsync();
  if (permission.status !== "granted") {
    const alreadyAsked = await AsyncStorage.getItem(LOCATION_PERMISSION_REQUESTED_KEY);
    if (!alreadyAsked && permission.canAskAgain) {
      permission = await Location.requestForegroundPermissionsAsync();
      await AsyncStorage.setItem(LOCATION_PERMISSION_REQUESTED_KEY, "true");
    }
  }
  if (permission.status !== "granted") {
    throw new Error("Location access is off. Open your phone's Settings > Apps > Malawi Market > Permissions > Location to enable it.");
  }
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

export type NearbyShop = {
  id:string;
  name:string;
  category:string;
  latitude:number;
  longitude:number;
  address:string;
  phone?:string;
  website?:string;
  distanceKm:number;
};

const nearbyShopCache = new Map<string,{savedAt:number;shops:NearbyShop[]}>();
const SHOP_CATEGORY_FILTERS:Record<string,string> = {
  "All shops": 'node["shop"];way["shop"];relation["shop"];node["amenity"~"marketplace|pharmacy"];way["amenity"~"marketplace|pharmacy"];',
  "Groceries": 'node["shop"~"supermarket|convenience|greengrocer|butcher|bakery|deli"];way["shop"~"supermarket|convenience|greengrocer|butcher|bakery|deli"];',
  "Clothing": 'node["shop"~"clothes|shoes|fashion|tailor"];way["shop"~"clothes|shoes|fashion|tailor"];',
  "Electronics": 'node["shop"~"electronics|mobile_phone|computer|computer_parts"];way["shop"~"electronics|mobile_phone|computer|computer_parts"];',
  "Hardware": 'node["shop"~"hardware|doityourself|building_materials"];way["shop"~"hardware|doityourself|building_materials"];',
  "Pharmacies": 'node["amenity"="pharmacy"];way["amenity"="pharmacy"];',
  "Markets": 'node["amenity"="marketplace"];way["amenity"="marketplace"];',
};

function distanceBetweenKm(a:Coordinates,b:Coordinates):number {
  const radians=(value:number)=>value*Math.PI/180;
  const dLat=radians(b.latitude-a.latitude);
  const dLon=radians(b.longitude-a.longitude);
  const lat1=radians(a.latitude);
  const lat2=radians(b.latitude);
  const h=Math.sin(dLat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;
  return 6371*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));
}

export async function searchNearbyShops(
  coordinates:Coordinates,
  radiusMeters=5000,
  category="All shops",
  query=""
):Promise<NearbyShop[]> {
  const radius=Math.min(15000,Math.max(500,radiusMeters));
  const cacheKey=[coordinates.latitude.toFixed(3),coordinates.longitude.toFixed(3),radius,category].join(":");
  let shops=nearbyShopCache.get(cacheKey)?.shops;
  const cached=nearbyShopCache.get(cacheKey);
  if(!shops||!cached||Date.now()-cached.savedAt>180000){
    const selectors=SHOP_CATEGORY_FILTERS[category]||SHOP_CATEGORY_FILTERS["All shops"];
    const queryText=`[out:json][timeout:20];( ${selectors.split(";").filter(Boolean).map(selector=>selector+`(around:${radius},${coordinates.latitude},${coordinates.longitude});`).join(" ")} );out center tags 80;`;
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),25000);
    try{
      const response=await fetch("https://overpass.private.coffee/api/interpreter",{
        method:"POST",
        headers:{"Content-Type":"application/x-www-form-urlencoded;charset=UTF-8","Accept":"application/json","User-Agent":"MalawiMarket/1.0 shop-discovery"},
        body:"data="+encodeURIComponent(queryText),
        signal:controller.signal,
      });
      const body=await readJson(response,"OpenStreetMap shop search");
      shops=(body.elements||[]).map((element:any):NearbyShop|null=>{
        const tags=element.tags||{};
        const point=element.center||element;
        const latitude=Number(point.lat);
        const longitude=Number(point.lon);
        const name=String(tags.name||tags.brand||tags.operator||"").trim();
        if(!name||!Number.isFinite(latitude)||!Number.isFinite(longitude))return null;
        const address=[tags["addr:housenumber"],tags["addr:street"],tags["addr:suburb"],tags["addr:city"]||tags["addr:district"]].filter(Boolean).join(", ")||tags["addr:full"]||"";
        const kind=String(tags.shop||tags.amenity||"shop").replace(/_/g," ");
        return {id:String(element.type)+"/"+String(element.id),name,category:kind,latitude,longitude,address,phone:tags["contact:phone"]||tags.phone,website:tags["contact:website"]||tags.website,distanceKm:distanceBetweenKm(coordinates,{latitude,longitude})};
      }).filter(Boolean) as NearbyShop[];
      shops.sort((left,right)=>left.distanceKm-right.distanceKm);
      nearbyShopCache.set(cacheKey,{savedAt:Date.now(),shops});
      if(nearbyShopCache.size>30)nearbyShopCache.delete(nearbyShopCache.keys().next().value as string);
    }finally{clearTimeout(timeout);}
  }
  const normalized=query.trim().toLowerCase();
  return (shops||[]).filter(shop=>!normalized||[shop.name,shop.category,shop.address].join(" ").toLowerCase().includes(normalized)).slice(0,50);
}

export function mapboxStaticImageUrl(coordinates: Coordinates, markers:Coordinates[]=[]): string {
  if (!MAPBOX_TOKEN) return "";
  const { latitude, longitude } = coordinates;
  const shopPins=markers.slice(0,10).map(point=>`pin-s+0F766E(${point.longitude},${point.latitude})`);
  const overlays=[...shopPins,`pin-s+ef7b25(${longitude},${latitude})`].join(",");
  return `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${overlays}/${longitude},${latitude},13/900x520?access_token=${encodeURIComponent(MAPBOX_TOKEN)}`;
}
