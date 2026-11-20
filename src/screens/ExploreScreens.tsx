import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { Image } from "react-native";
import { fetchLiveFootballFixtures, fetchWeather, requestDeviceCoordinates, searchMapboxPlaces, mapboxStaticImageUrl, liveServiceAvailability, Coordinates } from "../lib/live-services";
import {marketText,MarketLanguage} from "../lib/i18n";
import {MarketIcon} from "../components/MarketIcon";
import { ScrollView, View, Text, TextInput, Pressable, StyleSheet, Linking, Alert, BackHandler } from "react-native";

type Section = "hub" | "news" | "jobs" | "stocks" | "football" | "weather" | "map" | "businesses";
const orange = "#ef7b25";
const navy = "#252a31";
const news: {category:string;title:string;summary:string;source:string;age:string;sourceUrl?:string}[] = [];
const jobs: {title:string;company:string;location:string;type:string;category:string;salary:string;applicationUrl?:string}[] = [];
const stocks: {symbol:string;name:string;sector:string;price:string;change:string;sourceName?:string;quoteTime?:string}[] = [];
const fixtures: {league:string;home:string;away:string;time:string;score:string;status?:string;sourceName?:string;sourceUrl?:string}[] = [];
const categories = ["All","Business","Technology","Agriculture","Sports"];
const jobTypes = ["All","Full time","Part time","Contract","Internship"];

export function ExploreScreens({language,theme="light",accentColor="#3B82F6",onHardwareBack}:{language:MarketLanguage;theme?:"light"|"dark";accentColor?:string;onHardwareBack:()=>void}) {
  const [section,setSection] = useState<Section>("hub");
  const darkMode=theme==="dark";
  const topicPalette:Record<Section,{accent:string;tint:string;darkTint:string;label:string}>={
    hub:{accent:accentColor,tint:"#fff1e5",darkTint:"#39271d",label:"Discover"},
    news:{accent:"#2563EB",tint:"#EFF6FF",darkTint:"#172b4d",label:"News"},
    jobs:{accent:"#B45309",tint:"#FEF3C7",darkTint:"#3c2c17",label:"Careers"},
    stocks:{accent:"#0F766E",tint:"#CCFBF1",darkTint:"#123b39",label:"Markets"},
    football:{accent:"#DC2626",tint:"#FEE2E2",darkTint:"#451f25",label:"Sports"},
    weather:{accent:"#0284C7",tint:"#E0F2FE",darkTint:"#12364b",label:"Weather"},
    map:{accent:"#7C3AED",tint:"#EDE9FE",darkTint:"#30214d",label:"Places"},
    businesses:{accent:"#15803D",tint:"#DCFCE7",darkTint:"#183b29",label:"Business"},
  };
  const topic=topicPalette[section];
  const surface=darkMode?"#1b1f27":"#ffffff";
  const page=darkMode?"#111318":"#ffffff";
  const ink=darkMode?"#f3f4f6":"#202124";
  const muted=darkMode?"#aab2bf":"#4b5563";
  const line=darkMode?"#343b47":"#d9dde3";
  const [newsCategory,setNewsCategory] = useState("All");
  const [jobType,setJobType] = useState("All");
  const [search,setSearch] = useState("");
  const [newsRows,setNewsRows] = useState(news);
  const [jobRows,setJobRows] = useState(jobs);
  const [stockRows,setStockRows] = useState(stocks);
  const [fixtureRows,setFixtureRows] = useState(fixtures);
  const [businessRows,setBusinessRows]=useState<any[]>([]);
  const [feedAds,setFeedAds]=useState<any[]>([]);
  const [businessAds,setBusinessAds]=useState<any[]>([]);
  const [liveFlags,setLiveFlags] = useState({news:false,jobs:false,stocks:false,football:false});
  const [standings,setStandings] = useState<any[]>([]);
  const [loadingData,setLoadingData] = useState(true);
  const [loadError,setLoadError] = useState("");
  const [reloadKey,setReloadKey] = useState(0);
  const [weather,setWeather] = useState<any>(null);
  const [weatherLoading,setWeatherLoading] = useState(false);
  const [weatherError,setWeatherError] = useState("");
  const [coordinates,setCoordinates] = useState<Coordinates>({latitude:-13.2543,longitude:34.3015});
  const [mapQuery,setMapQuery] = useState("");
  const [mapResults,setMapResults] = useState<{name:string;latitude:number;longitude:number}[]>([]);
  const [mapError,setMapError] = useState("");
  const [mapLoading,setMapLoading] = useState(false);
  useEffect(()=>{
    let active=true;
    const loadDirectoryAndAds=async()=>{
      const now=new Date().toISOString();
      const [shops,feed,business]=await Promise.all([
        supabase.from("market_sellers").select("id,name,slug,description,location,logo_url,whatsapp_url,is_verified").eq("status","active").order("name").limit(100),
        supabase.from("market_ad_campaigns").select("id,business_name,title,body,destination_url,image_url,placement").eq("status","active").eq("payment_status","paid").eq("placement","feed").or("starts_at.is.null,starts_at.lte."+now).or("ends_at.is.null,ends_at.gt."+now).limit(3),
        supabase.from("market_ad_campaigns").select("id,business_name,title,body,destination_url,image_url,placement").eq("status","active").eq("payment_status","paid").eq("placement","business").or("starts_at.is.null,starts_at.lte."+now).or("ends_at.is.null,ends_at.gt."+now).limit(3)
      ]);
      if(!active)return;
      if(shops.data)setBusinessRows(shops.data);
      if(feed.data)setFeedAds(feed.data);
      if(business.data)setBusinessAds(business.data);
      for(const ad of [...(feed.data??[]),...(business.data??[])])void supabase.functions.invoke("onekhusa-payments",{body:{action:"track_ad_event",campaign_id:ad.id,event_type:"impression"}});
    };
    void loadDirectoryAndAds();
    return()=>{active=false;};
  },[]);

  const [locationLabel,setLocationLabel] = useState("Malawi overview");
  useEffect(()=>{
    const subscription=BackHandler.addEventListener("hardwareBackPress",()=>{
      if(section!=="hub"){setSection("hub");setSearch("");return true;}
      onHardwareBack();
      return true;
    });
    return()=>subscription.remove();
  },[section,onHardwareBack]);
  useEffect(()=>{ let active=true; setLoadingData(true); setLoadError(""); Promise.all([
    supabase.from("market_news_articles").select("id,title,summary,category,source_name,source_url,published_at").eq("is_published",true).order("published_at",{ascending:false}).limit(40),
    supabase.from("market_job_listings").select("id,title,company_name,location,job_type,category,description,salary_range,application_url").eq("is_published",true).order("created_at",{ascending:false}).limit(40),
    supabase.from("market_stock_quotes").select("id,symbol,company_name,price,change_percent,currency,quote_time,source_name,source_url").order("quote_time",{ascending:false}).limit(50),
    supabase.from("market_football_fixtures").select("id,competition,home_team,away_team,home_score,away_score,kickoff_at,status,source_name,source_url").eq("is_published",true).order("kickoff_at",{ascending:true}).limit(40),
    supabase.from("market_football_standings").select("id,competition,season,team_name,played,won,drawn,lost,goals_for,goals_against,points,position,source_name,source_url").order("position",{ascending:true}).limit(100)
   ]).then(([n,j,st,ft,table])=>{if(!active)return;
    const firstError=n.error||j.error||st.error||ft.error||table.error;
    if(firstError)setLoadError(firstError.message||"Some Explore data could not be loaded. Try again.");
    if(n.data?.length){setNewsRows(n.data.map(x=>({category:x.category,title:x.title,summary:x.summary||"",source:x.source_name,sourceUrl:x.source_url,age:new Date(x.published_at).toLocaleDateString()})));setLiveFlags(v=>({...v,news:true}));}
    if(j.data?.length){setJobRows(j.data.map(x=>({title:x.title,company:x.company_name,location:x.location||"Malawi",type:x.job_type.replace(/_/g," ").replace(/\b\w/g,(m:string)=>m.toUpperCase()),category:x.category,salary:x.salary_range||"Not specified",applicationUrl:x.application_url||undefined})));setLiveFlags(v=>({...v,jobs:true}));}
    if(st.data?.length){const latest=new Map();st.data.forEach(x=>{if(!latest.has(x.symbol))latest.set(x.symbol,x);});setStockRows(Array.from(latest.values()).map(x=>({symbol:x.symbol,name:x.company_name,sector:"Malawi Stock Exchange",price:x.price===null?"Unavailable":x.currency+" "+Number(x.price).toLocaleString(),change:x.change_percent===null?"—":(Number(x.change_percent)>0?"+":"")+Number(x.change_percent).toFixed(2)+"%",sourceName:x.source_name,quoteTime:new Date(x.quote_time).toLocaleString()})));setLiveFlags(v=>({...v,stocks:true}));}
    if(ft.data?.length){setFixtureRows(ft.data.map(x=>({league:x.competition,home:x.home_team,away:x.away_team,time:new Date(x.kickoff_at).toLocaleString(),score:x.home_score===null||x.away_score===null?"— : —":x.home_score+" : "+x.away_score,status:x.status,sourceName:x.source_name,sourceUrl:x.source_url})));setLiveFlags(v=>({...v,football:true}));}
    if(table.data?.length)setStandings(table.data);
  }).catch((error:any)=>{if(active)setLoadError(error?.message||"Explore data could not be loaded. Check your connection and try again.");}).finally(()=>{if(active)setLoadingData(false);}); return ()=>{active=false;}; },[reloadKey]);
  useEffect(()=>{let active=true;if(!liveServiceAvailability.football)return;fetchLiveFootballFixtures().then(rows=>{if(active&&rows.length){setFixtureRows(rows);setLiveFlags(v=>({...v,football:true}));}}).catch(error=>{if(active)setLoadError(error?.message||"Football data could not be loaded.");});return()=>{active=false;};},[reloadKey]);
  const loadCurrentWeather = async () => {
    setWeatherLoading(true);setWeatherError("");
    try {const point=await requestDeviceCoordinates();setCoordinates(point);setLocationLabel("Current device location");setWeather(await fetchWeather(point));}
    catch(error:any){setWeatherError(error?.message||"Weather could not be loaded.");}
    finally{setWeatherLoading(false);}
  };
  const useCurrentMapLocation = async () => {
    setMapLoading(true);setMapError("");
    try{const point=await requestDeviceCoordinates();setCoordinates(point);setLocationLabel("Current device location");setMapResults([]);}
    catch(error:any){setMapError(error?.message||"Could not read device location.");}
    finally{setMapLoading(false);}
  };
  const findMapPlaces = async () => {
    if(!mapQuery.trim()){setMapError("Enter a town, district or place name.");return;}
    setMapLoading(true);setMapError("");
    try{const found=await searchMapboxPlaces(mapQuery.trim());setMapResults(found);if(!found.length)setMapError("No matching Malawi locations found.");}
    catch(error:any){setMapError(error?.message||"Map search failed.");}
    finally{setMapLoading(false);}
  };
  const filteredNews = useMemo(()=>newsRows.filter(x=>(newsCategory==="All"||x.category===newsCategory)&&(!search||x.title.toLowerCase().includes(search.toLowerCase()))),[newsRows,newsCategory,search]);
  const filteredJobs = useMemo(()=>jobRows.filter(x=>(jobType==="All"||x.type===jobType)&&(!search||[x.title,x.company,x.location,x.category].join(" ").toLowerCase().includes(search.toLowerCase()))),[jobRows,jobType,search]);
  const go = (next:Section) => { setSearch(""); setSection(next); };
  const openExternal = async (url?:string) => {
    if(!url)return;
    try{await Linking.openURL(url);}
    catch{Alert.alert("Unable to open link","Check your internet connection or try opening this link again.");}
  };
  const sponsoredCard=(ad:any)=><Pressable key={ad.id} accessibilityRole="link" style={{backgroundColor:surface,borderWidth:1,borderColor:line,borderRadius:13,marginTop:10,overflow:"hidden",flexDirection:"row"}} onPress={()=>{void supabase.functions.invoke("onekhusa-payments",{body:{action:"track_ad_event",campaign_id:ad.id,event_type:"click"}});void openExternal(ad.destination_url);}}><Image source={{uri:ad.image_url}} style={{width:92,height:104,backgroundColor:"#eee"}} resizeMode="cover"/><View style={{flex:1,padding:11,justifyContent:"center"}}><Text style={{fontSize:9,fontWeight:"900",color:"#b45d20"}}>SPONSORED · {ad.business_name}</Text><Text style={{fontSize:14,fontWeight:"900",color:ink,marginTop:5}}>{ad.title}</Text><Text numberOfLines={2} style={{fontSize:11,color:muted,marginTop:4}}>{ad.body}</Text><Text style={{fontSize:10,color:orange,fontWeight:"900",marginTop:6}}>Learn more ›</Text></View></Pressable>;
  const heading = marketText(language,section==="news"?"News":section==="jobs"?"Job vacancies":section==="stocks"?"Malawi Stock Market":section==="football"?"Football":section==="weather"?"Weather":section==="map"?"Map & Location":section==="businesses"?"Businesses":"Malawi Market");
  const pill = (label:string, active:boolean, action:()=>void) => <Pressable key={label} onPress={action} style={[s.pill,{backgroundColor:surface,borderColor:line},active&&{backgroundColor:topic.accent,borderColor:topic.accent}]}><Text style={[s.pillText,{color:active?"#fff":muted}]}>{label}</Text></Pressable>;
  const notice = (text:string) => <View style={[s.notice,{backgroundColor:darkMode?topic.darkTint:topic.tint}]}><Text style={s.noticeText}>DATA STATUS · {text}</Text></View>;
  return <ScrollView style={[s.root,{backgroundColor:page}]} contentContainerStyle={s.content}>
    {section!=="hub" && <Pressable onPress={()=>go("hub")} style={s.back}><Text style={[s.backText,{color:topic.accent}]}>‹  {marketText(language,"Explore")}</Text></Pressable>}
    <Text style={[s.title,{color:topic.accent}]}>{heading}</Text>
    {loadingData?<View style={[s.statusPanel,{backgroundColor:surface,borderColor:line}]}><Text style={s.statusTitle}>Loading verified information…</Text><Text style={s.statusBody}>Fetching the latest available content.</Text></View>:null}
    {loadError?<View style={[s.statusPanel,{backgroundColor:surface,borderColor:line}]}><Text style={s.statusTitle}>Some information could not be loaded</Text><Text style={s.statusBody}>{loadError}</Text><Pressable onPress={()=>setReloadKey(v=>v+1)} style={s.retry}><Text style={s.retryText}>Try again</Text></Pressable></View>:null}
    {section==="hub" ? <>
      {feedAds.map(sponsoredCard)}
      <Text style={[s.subheading,{color:ink}]}>GENERAL</Text>
      <Text style={[s.subtitle,{color:muted}]}>Useful information and opportunities from across Malawi.</Text>
      {[
        ["stocks","stocks","Stock Market","Malawi Stock Exchange information and company quotes"],
        ["news","news","News","Stories and updates from verified sources"],
        ["jobs","jobs","Jobs","Published job vacancies and opportunities"],
      ].map(([key,icon,label,desc])=>{
        const colors=topicPalette[key as Section];
        return <Pressable key={key} style={[s.menuCard,{backgroundColor:surface,borderColor:line}]} onPress={()=>go(key as Section)}>
          <View style={[s.menuIcon,{backgroundColor:darkMode?colors.darkTint:colors.tint}]}><MarketIcon name={icon} size={23} color={colors.accent}/></View>
          <View style={{flex:1}}><Text style={[s.menuTitle,{color:ink}]}>{marketText(language,label)}</Text><Text style={[s.menuDesc,{color:muted}]}>{desc}</Text></View>
          <Text style={[s.arrow,{color:colors.accent}]}>›</Text>
        </Pressable>;
      })}
      <Text style={[s.subheading,{marginTop:24}]}>LOCAL SERVICES</Text>
      <Pressable style={s.menuCard} onPress={()=>go("businesses")}><View style={s.menuIcon}><MarketIcon name="store" size={23} color={orange}/></View><View style={{flex:1}}><Text style={s.menuTitle}>Businesses</Text><Text style={s.menuDesc}>Discover active marketplace stores</Text></View><Text style={s.arrow}>›</Text></Pressable>
      <Pressable style={s.menuCard} onPress={()=>go("weather")}><View style={s.menuIcon}><MarketIcon name="weather" size={23} color={orange}/></View><View style={{flex:1}}><Text style={s.menuTitle}>Weather</Text><Text style={s.menuDesc}>Current conditions at your device location</Text></View><Text style={s.arrow}>›</Text></Pressable>
      <Pressable style={s.menuCard} onPress={()=>go("map")}><View style={s.menuIcon}><MarketIcon name="map" size={23} color={orange}/></View><View style={{flex:1}}><Text style={s.menuTitle}>Map & Location</Text><Text style={s.menuDesc}>Find places and view a map of Malawi</Text></View><Text style={s.arrow}>›</Text></Pressable>
      <Text style={[s.subheading,{marginTop:24}]}>SPORTS</Text>
      <Pressable style={s.menuCard} onPress={()=>go("football")}><View style={s.menuIcon}><MarketIcon name="football" size={23} color={orange}/></View><View style={{flex:1}}><Text style={s.menuTitle}>Football</Text><Text style={s.menuDesc}>Fixtures, results and league information</Text></View><Text style={s.arrow}>›</Text></Pressable>
    </> : null}
    {section==="businesses" ? <>
      {businessAds.map(sponsoredCard)}
      <Text style={s.subtitle}>Active marketplace businesses and their contact details.</Text>
      {businessRows.map((shop:any)=><View key={shop.id} style={[s.article,{backgroundColor:surface,borderColor:line}]}><View style={{flexDirection:"row",alignItems:"center",gap:12}}>{shop.logo_url?<Image source={{uri:shop.logo_url}} style={{width:54,height:54,borderRadius:12}}/>:<View style={{width:54,height:54,borderRadius:12,backgroundColor:"#fff0e4",alignItems:"center",justifyContent:"center"}}><MarketIcon name="store" size={23} color={orange}/></View>}<View style={{flex:1}}><Text style={[s.cardTitle,{color:ink}]}>{shop.name}{shop.is_verified?" ✓":""}</Text><Text style={[s.meta,{color:muted}]}>{shop.location||"Location not provided"}</Text></View></View><Text style={[s.body,{color:muted}]}>{shop.description||"Marketplace seller"}</Text>{shop.whatsapp_url?<Pressable onPress={()=>void openExternal(shop.whatsapp_url)}><Text style={s.soon}>CONTACT BUSINESS</Text></Pressable>:null}</View>)}
      {!businessRows.length?<Text style={[s.empty,{color:muted}]}>No active businesses are listed yet.</Text>:null}
    </> : null}
    {section==="news" ? <>
      {notice(liveFlags.news?"Verified articles loaded from Malawi Market content feed.":"No verified articles are published yet. Sync Malawi24 RSS or add sourced articles in Admin.")}
      <TextInput value={search} onChangeText={setSearch} placeholder="Search verified headlines" style={[s.search,{backgroundColor:darkMode?"#252b35":"#f1f2f4",borderColor:line,color:ink}]}/>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:8,paddingVertical:10}}>{categories.map(c=>pill(c,newsCategory===c,()=>setNewsCategory(c)))}</ScrollView>
      {filteredNews.map((item,i)=><Pressable key={i} disabled={!item.sourceUrl} style={[s.article,{backgroundColor:surface,borderColor:line}]} onPress={()=>void openExternal(item.sourceUrl)}><Text style={[s.category,{color:topic.accent}]}>{item.category.toUpperCase()} · {item.age.toUpperCase()}</Text><Text style={[s.cardTitle,{color:ink}]}>{item.title}</Text><Text style={[s.body,{color:muted}]}>{item.summary}</Text><Text style={[s.meta,{color:muted}]}>{item.source} · Open original article</Text></Pressable>)}
      {!filteredNews.length&&<Text style={[s.empty,{color:muted}]}>No verified articles match this view yet.</Text>}
    </> : null}
    {section==="jobs" ? <>
      {notice(liveFlags.jobs?"Published job listings from Malawi Market content feed.":"No verified job listings are published yet. Employers and administrators can submit sourced vacancies.")}
      <TextInput value={search} onChangeText={setSearch} placeholder="Search role, company or location" style={[s.search,{backgroundColor:darkMode?"#252b35":"#f1f2f4",borderColor:line,color:ink}]}/>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:8,paddingVertical:10}}>{jobTypes.map(c=>pill(c,jobType===c,()=>setJobType(c)))}</ScrollView>
      {filteredJobs.map((item,i)=><Pressable key={i} disabled={!item.applicationUrl} style={[s.article,{backgroundColor:surface,borderColor:line}]} onPress={()=>void openExternal(item.applicationUrl)}><View style={s.row}><Text style={s.category}>{item.category.toUpperCase()}</Text><Text style={s.type}>{item.type}</Text></View><Text style={[s.cardTitle,{color:ink}]}>{item.title}</Text><Text style={[s.body,{color:muted}]}>{item.company}</Text><Text style={[s.meta,{color:muted}]}>⌖ {item.location}   ·   {item.salary}</Text>{item.applicationUrl?<Text style={s.soon}>OPEN APPLICATION</Text>:null}</Pressable>)}
      {!filteredJobs.length&&<Text style={[s.empty,{color:muted}]}>No verified vacancies match your search yet.</Text>}
    </> : null}
    {section==="stocks" ? <>
      {notice(liveFlags.stocks?"Latest available quotes from the configured stock data feed.":"No verified Malawi Stock Exchange quotes are available yet. Do not treat empty data as a market price.")}
      <View style={s.marketSummary}><Text style={s.summaryLabel}>MARKET WATCHLIST</Text><Text style={s.summaryValue}>Malawi Stock Exchange</Text><Text style={[s.meta,{color:muted}]}>Only sourced quotes are displayed. No live market-data provider is connected yet.</Text></View>
      {stockRows.map((item,i)=><View key={i} style={[s.stockRow,{backgroundColor:surface,borderColor:line}]}><View style={{flex:1}}><Text style={[s.stockSymbol,{color:topic.accent}]}>{item.symbol}</Text><Text style={[s.body,{color:muted}]}>{item.name}</Text><Text style={[s.meta,{color:muted}]}>{item.sector}</Text></View><View style={{alignItems:"flex-end"}}><Text style={[s.stockPrice,{color:topic.accent}]}>{item.price}</Text><Text style={[s.meta,{color:muted}]}>{item.change} · {item.sourceName||"Source not recorded"}</Text><Text style={[s.meta,{color:muted}]}>{item.quoteTime||""}</Text></View></View>)}
      {!stockRows.length?<Text style={[s.empty,{color:muted}]}>No current quotes are available. Administrators must publish sourced market data.</Text>:null}
    </> : null}
    {section==="football" ? <>
      {notice(liveFlags.football?"Fixtures loaded from Malawi Market football data feed.":"No verified fixtures are published yet. Add fixtures from an authoritative competition source.")}
      <View style={s.marketSummary}><Text style={s.summaryLabel}>FOOTBALL CENTRE</Text><Text style={s.summaryValue}>Malawi football</Text><Text style={[s.meta,{color:muted}]}>Fixtures · Results · Competitions</Text></View>
      {fixtureRows.map((item,i)=><Pressable key={i} disabled={!item.sourceUrl} style={[s.fixture,{backgroundColor:surface,borderColor:line}]} onPress={()=>void openExternal(item.sourceUrl)}><Text style={s.category}>{item.league.toUpperCase()}</Text><View style={s.fixtureTeams}><Text style={s.team}>{item.home}</Text><Text style={[s.score,{color:topic.accent}]}>{item.score}</Text><Text style={s.team}>{item.away}</Text></View><Text style={[s.meta,{color:muted}]}>{item.time} · {item.status||"scheduled"}</Text><Text style={[s.meta,{color:muted}]}>{item.sourceName||"Source not recorded"}</Text></Pressable>)}
      {!fixtureRows.length?<Text style={[s.empty,{color:muted}]}>No verified fixtures are available yet.</Text>:null}
      {standings.length?<><Text style={[s.subheading,{color:ink}]}>League standings</Text>{standings.map((team,i)=><View key={team.id} style={[s.stockRow,{backgroundColor:surface,borderColor:line}]}><Text style={s.stockSymbol}>{team.position}.</Text><View style={{flex:1,marginLeft:10}}><Text style={s.menuTitle}>{team.team_name}</Text><Text style={[s.meta,{color:muted}]}>{team.competition} · {team.season} · P {team.played} · W {team.won} · D {team.drawn} · L {team.lost}</Text><Text style={[s.meta,{color:muted}]}>{team.source_name||"Source not recorded"}</Text></View><Text style={s.stockPrice}>{team.points} pts</Text></View>)}</>:<View style={[s.coming,{backgroundColor:surface,borderColor:line}]}><Text style={s.comingText}>League standings</Text><Text style={s.soon}>AWAITING VERIFIED DATA SOURCE</Text></View> }
    </> : null}
    {section==="weather" ? <>
      {notice(liveServiceAvailability.weather?"OpenWeather connection configured.":"Weather API key missing from this Expo build.")}
      <View style={s.marketSummary}><Text style={s.summaryLabel}>LOCAL WEATHER</Text><Text style={s.summaryValue}>{weather?.place||"Weather near you"}</Text><Text style={[s.meta,{color:muted}]}>Uses your device location only after you grant permission.</Text></View>
      <Pressable style={s.retry} onPress={()=>void loadCurrentWeather()} disabled={weatherLoading}><Text style={s.retryText}>{weatherLoading?"Getting weather…":"Use my current location"}</Text></Pressable>
      {weatherError?<Text style={s.errorText}>{weatherError}</Text>:null}
      {weather?<View style={[s.weatherCard,{backgroundColor:surface,borderColor:line}]}><Text style={[s.temperature,{color:topic.accent}]}>{weather.temperature}°C</Text><Text style={[s.weatherDescription,{color:topic.accent}]}>{weather.description}</Text><Text style={[s.body,{color:muted}]}>Feels like {weather.feelsLike}°C</Text><View style={s.weatherStats}><Text style={[s.meta,{color:muted}]}>Humidity {weather.humidity}%</Text><Text style={[s.meta,{color:muted}]}>Wind {weather.wind} m/s</Text></View></View>:<Text style={[s.empty,{color:muted}]}>Tap the button to request location access and retrieve live weather.</Text>}
    </> : null}
    {section==="map" ? <>
      {notice(liveServiceAvailability.mapbox?"Mapbox map and place search configured.":"Mapbox public token missing from this Expo build.")}
      <TextInput value={mapQuery} onChangeText={setMapQuery} placeholder="Search a town or place in Malawi" style={[s.search,{backgroundColor:darkMode?"#252b35":"#f1f2f4",borderColor:line,color:ink}]} onSubmitEditing={()=>void findMapPlaces()}/>
      <Pressable style={s.retry} onPress={()=>void findMapPlaces()} disabled={mapLoading}><Text style={s.retryText}>{mapLoading?"Searching…":"Search places"}</Text></Pressable>
      <Pressable style={[s.outlineAction,{marginTop:9}]} onPress={()=>void useCurrentMapLocation()} disabled={mapLoading}><Text style={s.outlineActionText}>Use my current location</Text></Pressable>
      {mapError?<Text style={s.errorText}>{mapError}</Text>:null}
      {mapResults.map((place,i)=><Pressable key={i} style={[s.article,{backgroundColor:surface,borderColor:line}]} onPress={()=>{setCoordinates({latitude:place.latitude,longitude:place.longitude});setLocationLabel(place.name);setMapResults([]);}}><Text style={[s.cardTitle,{color:ink}]}>{place.name}</Text><Text style={[s.meta,{color:muted}]}>Tap to view this location</Text></Pressable>)}
      <Text style={[s.meta,{color:muted}]}>Showing: {locationLabel}</Text>
      {liveServiceAvailability.mapbox?<Image source={{uri:mapboxStaticImageUrl(coordinates)}} style={s.mapImage} resizeMode="cover"/>:<View style={s.mapPlaceholder}><Text style={[s.body,{color:muted}]}>Add the Mapbox public token to the Expo build to display the map.</Text></View>}
      <Text style={[s.meta,{color:muted}]}>Map preview by Mapbox · {coordinates.latitude.toFixed(4)}, {coordinates.longitude.toFixed(4)}</Text>
    </> : null}
  </ScrollView>;
}

const s=StyleSheet.create({
 root:{flex:1,backgroundColor:"#ffffff"},content:{padding:18,paddingBottom:120},back:{paddingVertical:8},backText:{color:orange,fontWeight:"800",fontSize:14},
 title:{fontSize:26,fontWeight:"700",color:"#202124",marginTop:10,letterSpacing:-.6},subtitle:{fontSize:13,color:"#4b5563",lineHeight:20,marginTop:6,marginBottom:16},
 menuCard:{flexDirection:"row",alignItems:"center",backgroundColor:"#ffffff",borderWidth:1,borderColor:"#d9dde3",borderRadius:15,padding:16,marginTop:10,elevation:0},menuIcon:{width:42,height:42,borderRadius:12,backgroundColor:"#fff1e5",alignItems:"center",justifyContent:"center",marginRight:13},menuTitle:{fontSize:15,fontWeight:"800",color:navy},menuDesc:{fontSize:11,color:"#4b5563",marginTop:4},arrow:{fontSize:26,color:orange,marginLeft:8},
 subheading:{fontSize:15,fontWeight:"900",color:navy,marginTop:24,marginBottom:8},coming:{backgroundColor:"#fff",borderRadius:10,padding:13,marginTop:7,borderWidth:1,borderColor:"#d9dde3"},comingText:{fontSize:12,fontWeight:"700",color:"#465267"},soon:{fontSize:9,color:"#9a6a3a",fontWeight:"900",marginTop:7,letterSpacing:.5},
 statusPanel:{backgroundColor:"#fff",borderRadius:16,padding:16,marginTop:13,borderWidth:1,borderColor:"#e7ebf0"},statusTitle:{fontSize:13,fontWeight:"900",color:navy},statusBody:{fontSize:11,color:"#4b5563",lineHeight:17,marginTop:5},retry:{alignSelf:"flex-start",backgroundColor:orange,borderRadius:8,paddingHorizontal:13,paddingVertical:9,marginTop:10},retryText:{fontSize:11,color:"#fff",fontWeight:"900"},
 notice:{backgroundColor:"#fff1e5",borderRadius:9,padding:11,marginTop:12},noticeText:{fontSize:10,color:"#8a4c19",fontWeight:"800",lineHeight:15},
 search:{height:48,backgroundColor:"#f1f2f4",borderWidth:1,borderColor:"#d9dde3",borderRadius:12,paddingHorizontal:14,marginTop:13,color:"#29292e"},
 pill:{borderRadius:18,borderWidth:1,borderColor:"#cbd1d9",paddingHorizontal:13,paddingVertical:8,backgroundColor:"#fff"},pillActive:{backgroundColor:orange,borderColor:orange},pillText:{fontSize:11,color:"#4f5a6c",fontWeight:"700"},
 article:{backgroundColor:"#ffffff",padding:16,borderRadius:15,borderWidth:1,borderColor:"#d9dde3",marginTop:11,elevation:0},category:{fontSize:9,fontWeight:"900",color:orange,letterSpacing:.7},cardTitle:{fontSize:16,fontWeight:"900",color:navy,marginTop:8,lineHeight:22},body:{fontSize:12,color:"#4b5563",lineHeight:18,marginTop:5},meta:{fontSize:10,color:"#4b5563",marginTop:8},row:{flexDirection:"row",justifyContent:"space-between",alignItems:"center"},type:{fontSize:10,color:navy,backgroundColor:"#edf1f6",paddingHorizontal:8,paddingVertical:5,borderRadius:6},empty:{textAlign:"center",color:"#4b5563",padding:24,fontSize:12},
 marketSummary:{backgroundColor:"#202124",borderRadius:16,padding:18,marginTop:14,marginBottom:9},summaryLabel:{fontSize:9,color:"#ffc18d",fontWeight:"900",letterSpacing:1},summaryValue:{fontSize:19,color:"#fff",fontWeight:"900",marginTop:6},stockRow:{flexDirection:"row",alignItems:"center",backgroundColor:"#fff",padding:14,borderBottomWidth:1,borderColor:"#d9dde3"},stockSymbol:{fontSize:15,fontWeight:"900",color:navy},stockPrice:{fontSize:12,fontWeight:"800",color:navy},
 errorText:{fontSize:11,color:"#b42318",marginTop:10,lineHeight:16},weatherCard:{backgroundColor:"#fff",borderWidth:1,borderColor:"#d9dde3",borderRadius:16,padding:18,marginTop:14},temperature:{fontSize:48,fontWeight:"900",color:navy},weatherDescription:{fontSize:16,fontWeight:"800",color:navy,textTransform:"capitalize",marginTop:4},weatherStats:{flexDirection:"row",justifyContent:"space-between",marginTop:14},mapImage:{width:"100%",height:230,borderRadius:14,marginTop:14,backgroundColor:"#eef1f4"},mapPlaceholder:{height:180,alignItems:"center",justifyContent:"center",padding:20,backgroundColor:"#f1f3f5",borderRadius:14,marginTop:14},outlineAction:{borderWidth:1,borderColor:orange,borderRadius:9,padding:11,alignSelf:"flex-start"},outlineActionText:{color:orange,fontWeight:"800",fontSize:11},fixture:{backgroundColor:"#fff",borderWidth:1,borderColor:"#e9edf2",borderRadius:17,padding:16,marginTop:12},fixtureTeams:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",marginTop:12,marginBottom:8},team:{flex:1,fontSize:11,fontWeight:"800",color:navy},score:{fontSize:13,fontWeight:"900",color:orange,paddingHorizontal:8}
});
