import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { Image } from "react-native";
import { fetchLiveFootballFixtures, fetchWeather, fetchExchangeRates, requestDeviceCoordinates, searchMapboxPlaces, searchNearbyShops, mapboxStaticImageUrl, liveServiceAvailability, Coordinates, NearbyShop, ExchangeRate } from "../lib/live-services";
import {marketText,MarketLanguage} from "../lib/i18n";
import {MarketIcon} from "../components/MarketIcon";
import { ScrollView, View, Text, TextInput, Pressable, StyleSheet, Linking, Alert, BackHandler } from "react-native";

type Section = "hub" | "news" | "jobs" | "stocks" | "exchange" | "weather" | "map" | "businesses";
const orange = "#ef7b25";
const navy = "#252a31";
const news: {category:string;title:string;summary:string;source:string;age:string;sourceUrl?:string}[] = [];
const jobs: {title:string;company:string;location:string;type:string;category:string;salary:string;applicationUrl?:string}[] = [];
const stocks: {symbol:string;name:string;sector:string;price:string;change:string;sourceName?:string;quoteTime?:string}[] = [];
const fixtures: {league:string;home:string;away:string;time:string;score:string;status?:string;sourceName?:string;sourceUrl?:string}[] = [];
const categories = ["All","Malawi","Africa","World","Business","Technology","Agriculture","Sports"];
const jobTypes = ["All","Full time","Part time","Contract","Internship"];

export function ExploreScreens({language,theme="light",accentColor="#3B82F6",onHardwareBack}:{language:MarketLanguage;theme?:"light"|"dark";accentColor?:string;onHardwareBack:()=>void}) {
  const [section,setSection] = useState<Section>("hub");
  const darkMode=theme==="dark";
  const topicPalette:Record<Section,{accent:string;tint:string;darkTint:string;label:string}>={
    hub:{accent:accentColor,tint:"#fff1e5",darkTint:"#39271d",label:"Discover"},
    news:{accent:"#2563EB",tint:"#EFF6FF",darkTint:"#172b4d",label:"News"},
    jobs:{accent:"#B45309",tint:"#FEF3C7",darkTint:"#3c2c17",label:"Careers"},
    stocks:{accent:"#0F766E",tint:"#CCFBF1",darkTint:"#123b39",label:"Markets"},
    exchange:{accent:"#0F766E",tint:"#CCFBF1",darkTint:"#123b39",label:"Exchange Rates"},
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
  const [sportsCategory,setSportsCategory] = useState("All sports");
  const [sportsMatchTab,setSportsMatchTab] = useState("All");
  const [stocksFilter,setStocksFilter] = useState("All");
  const [jobType,setJobType] = useState("All");
  const [search,setSearch] = useState("");
  const [newsRows,setNewsRows] = useState(news);
  const [jobRows,setJobRows] = useState(jobs);
  const [stockRows,setStockRows] = useState(stocks);
  const [exchangeRates,setExchangeRates] = useState<ExchangeRate[]>([]);
  const [exchangeUpdatedAt,setExchangeUpdatedAt] = useState("");
  const [exchangeLoading,setExchangeLoading] = useState(false);
  const [exchangeError,setExchangeError] = useState("");
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
  const [shopQuery,setShopQuery] = useState("");
  const [shopCategory,setShopCategory] = useState("All shops");
  const [nearbyShops,setNearbyShops] = useState<NearbyShop[]>([]);
  const [shopsLoading,setShopsLoading] = useState(false);
  const [shopsError,setShopsError] = useState("");
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
      if(section==="stocks"||section==="exchange"){setSection("news");setSearch("");return true;}
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
  useEffect(()=>{
    if(section!=="exchange")return;
    let active=true;
    setExchangeLoading(true);setExchangeError("");
    fetchExchangeRates().then(snapshot=>{
      if(!active)return;
      setExchangeRates(snapshot.rates);
      setExchangeUpdatedAt(snapshot.updatedAt);
    }).catch((error:any)=>{
      if(active)setExchangeError(error?.message||"Exchange rates could not be loaded. Check your connection and retry.");
    }).finally(()=>{if(active)setExchangeLoading(false);});
    return()=>{active=false;};
  },[section,reloadKey]);

  const loadCurrentWeather = async () => {
    setWeatherLoading(true);setWeatherError("");
    try {const point=await requestDeviceCoordinates();setCoordinates(point);setLocationLabel("Current device location");setWeather(await fetchWeather(point));}
    catch(error:any){setWeatherError(error?.message||"Weather could not be loaded.");}
    finally{setWeatherLoading(false);}
  };
  const loadNearbyShops = async (point:Coordinates=coordinates,category:string=shopCategory,query:string=shopQuery) => {
    setShopsLoading(true);setShopsError("");
    try{
      const found=await searchNearbyShops(point,5000,category,query);
      setNearbyShops(found);
      if(!found.length)setShopsError("No mapped shops matched this search nearby. Try another category or expand your search area.");
    }catch(error:any){
      setNearbyShops([]);
      setShopsError(error?.message||"Nearby shops could not be loaded. Try again shortly.");
    }finally{setShopsLoading(false);}
  };
  const useCurrentMapLocation = async () => {
    setMapLoading(true);setMapError("");
    try{
      const point=await requestDeviceCoordinates();
      setCoordinates(point);setLocationLabel("Current device location");setMapResults([]);
      await loadNearbyShops(point,shopCategory,shopQuery);
    }catch(error:any){
      const message=error?.message||"Could not read device location.";
      setMapError(message);
      if(message.includes("phone's Settings"))Alert.alert("Location access is off",message,[{text:"Cancel",style:"cancel"},{text:"Open Settings",onPress:()=>void Linking.openSettings()}]);
    }
    finally{setMapLoading(false);}
  };
  const findMapPlaces = async () => {
    if(!mapQuery.trim()){setMapError("Enter a town, district or place name.");return;}
    setMapLoading(true);setMapError("");
    try{const found=await searchMapboxPlaces(mapQuery.trim());setMapResults(found);if(!found.length)setMapError("No matching Malawi locations found.");}
    catch(error:any){setMapError(error?.message||"Map search failed.");}
    finally{setMapLoading(false);}
  };
  const openShopDirections = async (shop:NearbyShop) => {
    const url=`https://www.google.com/maps/dir/?api=1&destination=${shop.latitude},${shop.longitude}&travelmode=walking`;
    try{await Linking.openURL(url);}catch{Alert.alert("Directions unavailable","No maps application could open this location.");}
  };
  const filteredNews = useMemo(()=>newsRows.filter(x=>(newsCategory==="All"||x.category.toLowerCase()===newsCategory.toLowerCase())&&(!search||x.title.toLowerCase().includes(search.toLowerCase()))),[newsRows,newsCategory,search]);
  const sportsArticles = useMemo(()=>newsRows.filter(x=>/sport|football|basketball|athletic|netball|cricket/i.test(x.category)).filter(x=>sportsCategory==="All sports"||x.category.toLowerCase().includes(sportsCategory.toLowerCase())),[newsRows,sportsCategory]);
  const sportsFixtures = useMemo(()=>fixtureRows.filter(x=>{const status=(x.status||"").toLowerCase();if(sportsMatchTab==="Live")return /live|in.?play|half.?time/.test(status);if(sportsMatchTab==="Results")return /finished|full.?time|(^|\b)ft(\b|$)|completed/.test(status);if(sportsMatchTab==="Upcoming")return !/live|in.?play|half.?time|finished|full.?time|(^|\b)ft(\b|$)|completed/.test(status);return true;}),[fixtureRows,sportsMatchTab]);
  const filteredJobs = useMemo(()=>jobRows.filter(x=>(jobType==="All"||x.type===jobType)&&(!search||[x.title,x.company,x.location,x.category].join(" ").toLowerCase().includes(search.toLowerCase()))),[jobRows,jobType,search]);
  const marketStats = useMemo(()=>({gainers:stockRows.filter(x=>Number.parseFloat(x.change)<0?false:Number.parseFloat(x.change)>0).length,decliners:stockRows.filter(x=>Number.parseFloat(x.change)<0).length,unchanged:stockRows.filter(x=>Number.parseFloat(x.change)===0).length}),[stockRows]);
  const filteredStocks = useMemo(()=>stockRows.filter(x=>(stocksFilter==="All"||(stocksFilter==="Gainers"&&Number.parseFloat(x.change)>0)||(stocksFilter==="Decliners"&&Number.parseFloat(x.change)<0)||(stocksFilter==="Unchanged"&&Number.parseFloat(x.change)===0))&&(!search||[x.symbol,x.name,x.sector].join(" ").toLowerCase().includes(search.toLowerCase()))),[stockRows,stocksFilter,search]);
  const go = (next:Section) => { setSearch(""); setSection(next); };
  const openExternal = async (url?:string) => {
    if(!url)return;
    try{await Linking.openURL(url);}
    catch{Alert.alert("Unable to open link","Check your internet connection or try opening this link again.");}
  };
  const sponsoredCard=(ad:any)=><Pressable key={ad.id} accessibilityRole="link" style={{backgroundColor:surface,borderWidth:1,borderColor:line,borderRadius:13,marginTop:10,overflow:"hidden",flexDirection:"row"}} onPress={()=>{void supabase.functions.invoke("onekhusa-payments",{body:{action:"track_ad_event",campaign_id:ad.id,event_type:"click"}});void openExternal(ad.destination_url);}}><Image source={{uri:ad.image_url}} style={{width:92,height:104,backgroundColor:"#eee"}} resizeMode="cover"/><View style={{flex:1,padding:11,justifyContent:"center"}}><Text style={{fontSize:9,fontWeight:"900",color:"#b45d20"}}>SPONSORED · {ad.business_name}</Text><Text style={{fontSize:14,fontWeight:"900",color:ink,marginTop:5}}>{ad.title}</Text><Text numberOfLines={2} style={{fontSize:11,color:muted,marginTop:4}}>{ad.body}</Text><Text style={{fontSize:10,color:orange,fontWeight:"900",marginTop:6}}>Learn more ›</Text></View></Pressable>;
  const heading = marketText(language,section==="news"?"News":section==="jobs"?"Job vacancies":section==="stocks"?"Business & Markets":section==="exchange"?"Exchange Rates":section==="weather"?"Weather":section==="map"?"Map & Location":section==="businesses"?"Businesses":"Malawi Market");
  const pill = (label:string, active:boolean, action:()=>void) => <Pressable key={label} onPress={action} style={[s.pill,{backgroundColor:surface,borderColor:line},active&&{backgroundColor:topic.accent,borderColor:topic.accent}]}><Text style={[s.pillText,{color:active?"#fff":muted}]}>{label}</Text></Pressable>;
  const notice = (text:string) => <View style={[s.notice,{backgroundColor:darkMode?topic.darkTint:topic.tint}]}><Text style={s.noticeText}>DATA STATUS · {text}</Text></View>;
  return <ScrollView style={[s.root,{backgroundColor:page}]} contentContainerStyle={s.content}>
    {section!=="hub" && <Pressable onPress={()=>go(section==="stocks"||section==="exchange"?"news":"hub")} style={s.back}><Text style={[s.backText,{color:topic.accent}]}>‹  {section==="stocks"||section==="exchange"?"News":marketText(language,"Explore")}</Text></Pressable>}
    <Text style={[s.title,{color:topic.accent}]}>{heading}</Text>
    {loadingData?<View style={[s.statusPanel,{backgroundColor:surface,borderColor:line}]}><Text style={s.statusTitle}>Loading verified information…</Text><Text style={s.statusBody}>Fetching the latest available content.</Text></View>:null}
    {loadError?<View style={[s.statusPanel,{backgroundColor:surface,borderColor:line}]}><Text style={s.statusTitle}>Some information could not be loaded</Text><Text style={s.statusBody}>{loadError}</Text><Pressable onPress={()=>setReloadKey(v=>v+1)} style={s.retry}><Text style={s.retryText}>Try again</Text></Pressable></View>:null}
    {section==="hub" ? <>
      {feedAds.map(sponsoredCard)}
      <Text style={[s.subheading,{color:ink}]}>GENERAL</Text>
      <Text style={[s.subtitle,{color:muted}]}>Useful information and opportunities from across Malawi.</Text>
      {[
        ["news","news","News","Top stories, live reporting, sports and business markets"],
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
    </> : null}
    {section==="businesses" ? <>
      {businessAds.map(sponsoredCard)}
      <Text style={s.subtitle}>Active marketplace businesses and their contact details.</Text>
      {businessRows.map((shop:any)=><View key={shop.id} style={[s.article,{backgroundColor:surface,borderColor:line}]}><View style={{flexDirection:"row",alignItems:"center",gap:12}}>{shop.logo_url?<Image source={{uri:shop.logo_url}} style={{width:54,height:54,borderRadius:12}}/>:<View style={{width:54,height:54,borderRadius:12,backgroundColor:"#fff0e4",alignItems:"center",justifyContent:"center"}}><MarketIcon name="store" size={23} color={orange}/></View>}<View style={{flex:1}}><Text style={[s.cardTitle,{color:ink}]}>{shop.name}{shop.is_verified?" ✓":""}</Text><Text style={[s.meta,{color:muted}]}>{shop.location||"Location not provided"}</Text></View></View><Text style={[s.body,{color:muted}]}>{shop.description||"Marketplace seller"}</Text>{shop.whatsapp_url?<Pressable onPress={()=>void openExternal(shop.whatsapp_url)}><Text style={s.soon}>CONTACT BUSINESS</Text></Pressable>:null}</View>)}
      {!businessRows.length?<Text style={[s.empty,{color:muted}]}>No active businesses are listed yet.</Text>:null}
    </> : null}
    {section==="news" ? <>
      <View style={[s.newsMasthead,{backgroundColor:darkMode?"#202a38":"#12233f"}]}>
        <Text style={s.newsMastheadEyebrow}>MALAWI MARKET · NEWSROOM</Text>
        <Text style={s.newsMastheadTitle}>The stories shaping Malawi and the world.</Text>
        <Text style={s.newsMastheadCopy}>Reporting, context and updates from verified sources.</Text>
      </View>
      {notice(liveFlags.news?"Verified articles loaded from Malawi Market content feed.":"No verified articles are published yet. Stories appear here when sourced articles are published.")}
      <TextInput value={search} onChangeText={setSearch} placeholder="Search headlines and topics" placeholderTextColor={muted} style={[s.search,{backgroundColor:darkMode?"#252b35":"#f1f2f4",borderColor:line,color:ink}]}/>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:8,paddingVertical:10}}>{categories.map(c=>pill(c,newsCategory===c,()=>setNewsCategory(c)))}</ScrollView>
      {newsCategory.toLowerCase()!=="sports" ? <>
        <View style={[s.businessMarketsPanel,{backgroundColor:darkMode?"#202a38":"#F3F6FA",borderColor:line}]}>
          <View style={s.businessMarketsHeading}>
            <View style={{flex:1}}>
              <Text style={[s.businessMarketsTitle,{color:ink}]}>Business & Markets</Text>
              <Text style={[s.meta,{color:muted}]}>Follow Malawi's economy and global currencies.</Text>
            </View>
            <Text style={s.businessMarketsLabel}>MARKETS</Text>
          </View>
          <View style={s.businessMarketsActions}>
            <Pressable style={[s.businessMarketAction,{backgroundColor:surface,borderColor:line}]} onPress={()=>go("stocks")}>
              <Text style={s.businessMarketEyebrow}>MSE</Text><Text style={[s.businessMarketName,{color:ink}]}>Stock Market</Text><Text style={[s.meta,{color:muted}]}>Listed companies and share prices</Text><Text style={s.businessMarketLink}>OPEN MARKET ›</Text>
            </Pressable>
            <Pressable style={[s.businessMarketAction,{backgroundColor:surface,borderColor:line}]} onPress={()=>go("exchange")}>
              <Text style={s.businessMarketEyebrow}>MWK</Text><Text style={[s.businessMarketName,{color:ink}]}>Exchange Rates</Text><Text style={[s.meta,{color:muted}]}>Kwacha against major currencies</Text><Text style={s.businessMarketLink}>VIEW RATES ›</Text>
            </Pressable>
          </View>
        </View>
        {filteredNews.length>0 ? <Pressable disabled={!filteredNews[0].sourceUrl} onPress={()=>void openExternal(filteredNews[0].sourceUrl)} style={[s.newsLeadStory,{backgroundColor:darkMode?"#20242c":"#17253b"}]}>
          <Text style={s.newsLeadEyebrow}>TOP STORY · {filteredNews[0].category.toUpperCase()}</Text>
          <Text style={s.newsLeadTitle}>{filteredNews[0].title}</Text>
          <Text style={s.newsLeadSummary}>{filteredNews[0].summary}</Text>
          <Text style={s.newsLeadMeta}>{filteredNews[0].source} · {filteredNews[0].age}  {filteredNews[0].sourceUrl?"· READ STORY ↗":""}</Text>
        </Pressable>:null}
      </> : null}
      {newsCategory.toLowerCase()==="sports" ? <>
        <View style={[s.sportsHero,{backgroundColor:darkMode?"#102b27":"#123b35"}]}>
          <View style={s.sportsHeroTop}><Text style={s.sportsEyebrow}>MALAWI MARKET · SPORTS DESK</Text><Text style={s.sportsLiveTag}>SPORTS</Text></View>
          <Text style={s.sportsHeroTitle}>The game, beyond the headline.</Text>
          <Text style={s.sportsHeroCopy}>Scores, fixtures, league tables and the stories shaping sport in Malawi and beyond.</Text>
          <View style={s.sportsHeroStats}><View><Text style={s.sportsStatValue}>{fixtureRows.length}</Text><Text style={s.sportsStatLabel}>MATCHES</Text></View><View><Text style={s.sportsStatValue}>{standings.length}</Text><Text style={s.sportsStatLabel}>TABLE ENTRIES</Text></View><View><Text style={s.sportsStatValue}>{sportsArticles.length}</Text><Text style={s.sportsStatLabel}>STORIES</Text></View></View>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.sportsCategoryRow}>{["All sports","Football","Basketball","Netball","Athletics","Cricket"].map(c=><Pressable key={c} onPress={()=>setSportsCategory(c)} style={[s.sportsCategoryPill,sportsCategory===c&&s.sportsCategoryPillActive]}><Text style={[s.sportsCategoryText,sportsCategory===c&&s.sportsCategoryTextActive]}>{c}</Text></Pressable>)}</ScrollView>
        <View style={s.sportsSectionHead}><View><Text style={[s.sportsSectionTitle,{color:ink}]}>Match centre</Text><Text style={[s.meta,{color:muted}]}>Verified fixtures and results only</Text></View><Text style={s.sportsSectionAccent}>FOOTBALL</Text></View>
        <View style={s.sportsTabs}>{["All","Live","Upcoming","Results"].map(tab=><Pressable key={tab} onPress={()=>setSportsMatchTab(tab)} style={[s.sportsTab,sportsMatchTab===tab&&s.sportsTabActive]}><Text style={[s.sportsTabText,sportsMatchTab===tab&&s.sportsTabTextActive]}>{tab}</Text></Pressable>)}</View>
        {sportsCategory==="All sports"||sportsCategory==="Football" ? sportsFixtures.map((item,i)=><Pressable key={i} disabled={!item.sourceUrl} style={[s.sportsFixture,{backgroundColor:surface,borderColor:line}]} onPress={()=>void openExternal(item.sourceUrl)}>
          <View style={s.sportsFixtureTop}><Text style={s.sportsCompetition}>{item.league.toUpperCase()}</Text><Text style={s.sportsStatus}>{(item.status||"SCHEDULED").replace(/_/g," ").toUpperCase()}</Text></View>
          <View style={s.sportsTeams}><Text numberOfLines={2} style={[s.sportsTeam,{color:ink}]}>{item.home}</Text><View style={s.sportsScoreWrap}><Text style={s.sportsScore}>{item.score}</Text><Text style={[s.sportsTime,{color:muted}]}>{item.time}</Text></View><Text numberOfLines={2} style={[s.sportsTeam,{color:ink,textAlign:"right"}]}>{item.away}</Text></View>
          <View style={s.sportsFixtureFoot}><Text style={[s.meta,{color:muted}]}>{item.sourceName||"Source not recorded"}</Text>{item.sourceUrl?<Text style={s.sportsSourceLink}>MATCH DETAILS ↗</Text>:null}</View>
        </Pressable>):<View style={[s.sportsEmpty,{backgroundColor:surface,borderColor:line}]}><Text style={[s.sportsEmptyTitle,{color:ink}]}>{sportsCategory} coverage</Text><Text style={[s.body,{color:muted}]}>Stories will appear here when verified {sportsCategory.toLowerCase()} coverage is published. Match data is not fabricated.</Text></View>}
        {sportsCategory==="All sports"||sportsCategory==="Football" ? !sportsFixtures.length?<View style={[s.sportsEmpty,{backgroundColor:surface,borderColor:line}]}><Text style={[s.sportsEmptyTitle,{color:ink}]}>No verified matches yet</Text><Text style={[s.body,{color:muted}]}>Fixtures and results will appear here when a trusted source publishes them.</Text></View>:null:null}
        {sportsCategory==="All sports"||sportsCategory==="Football" ? <><View style={s.sportsSectionHead}><View><Text style={[s.sportsSectionTitle,{color:ink}]}>League table</Text><Text style={[s.meta,{color:muted}]}>Competition standings</Text></View></View>{standings.length?standings.map(team=><View key={team.id} style={[s.sportsTableRow,{backgroundColor:surface,borderColor:line}]}><Text style={[s.sportsPosition,{color:muted}]}>{team.position}</Text><View style={{flex:1}}><Text style={[s.sportsTableTeam,{color:ink}]}>{team.team_name}</Text><Text style={[s.meta,{color:muted}]}>{team.competition} · {team.season} · P {team.played} · W {team.won} · D {team.drawn} · L {team.lost}</Text></View><Text style={[s.sportsPoints,{color:ink}]}>{team.points} pts</Text></View>):<Text style={[s.empty,{color:muted}]}>Official standings will appear when verified data is available.</Text>}</>:null}
        <View style={s.sportsSectionHead}><View><Text style={[s.sportsSectionTitle,{color:ink}]}>From the sports desk</Text><Text style={[s.meta,{color:muted}]}>Reporting and analysis</Text></View></View>
        {sportsArticles.map((item,i)=><Pressable key={i} disabled={!item.sourceUrl} style={[s.article,{backgroundColor:surface,borderColor:line}]} onPress={()=>void openExternal(item.sourceUrl)}><Text style={[s.category,{color:"#0F766E"}]}>{item.category.toUpperCase()} · {item.age.toUpperCase()}</Text><Text style={[s.cardTitle,{color:ink}]}>{item.title}</Text><Text style={[s.body,{color:muted}]}>{item.summary}</Text><Text style={[s.meta,{color:muted}]}>{item.source} · Open original article</Text></Pressable>)}
        {!sportsArticles.length?<Text style={[s.empty,{color:muted}]}>No verified sports stories are published yet.</Text>:null}
      </> : <>
        {filteredNews.slice(1).map((item,i)=><Pressable key={i} disabled={!item.sourceUrl} style={[s.article,{backgroundColor:surface,borderColor:line}]} onPress={()=>void openExternal(item.sourceUrl)}><Text style={[s.category,{color:topic.accent}]}>{item.category.toUpperCase()} · {item.age.toUpperCase()}</Text><Text style={[s.cardTitle,{color:ink}]}>{item.title}</Text><Text style={[s.body,{color:muted}]}>{item.summary}</Text><Text style={[s.meta,{color:muted}]}>{item.source} · Open original article</Text></Pressable>)}
        {!filteredNews.length&&<Text style={[s.empty,{color:muted}]}>No verified articles match this view yet.</Text>}
      </>}
    </> : null}
    {section==="jobs" ? <>
      {notice(liveFlags.jobs?"Published job listings from Malawi Market content feed.":"No verified job listings are published yet. Employers and administrators can submit sourced vacancies.")}
      <TextInput value={search} onChangeText={setSearch} placeholder="Search role, company or location" style={[s.search,{backgroundColor:darkMode?"#252b35":"#f1f2f4",borderColor:line,color:ink}]}/>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:8,paddingVertical:10}}>{jobTypes.map(c=>pill(c,jobType===c,()=>setJobType(c)))}</ScrollView>
      {filteredJobs.map((item,i)=><Pressable key={i} disabled={!item.applicationUrl} style={[s.article,{backgroundColor:surface,borderColor:line}]} onPress={()=>void openExternal(item.applicationUrl)}><View style={s.row}><Text style={s.category}>{item.category.toUpperCase()}</Text><Text style={s.type}>{item.type}</Text></View><Text style={[s.cardTitle,{color:ink}]}>{item.title}</Text><Text style={[s.body,{color:muted}]}>{item.company}</Text><Text style={[s.meta,{color:muted}]}>⌖ {item.location}   ·   {item.salary}</Text>{item.applicationUrl?<Text style={s.soon}>OPEN APPLICATION</Text>:null}</Pressable>)}
      {!filteredJobs.length&&<Text style={[s.empty,{color:muted}]}>No verified vacancies match your search yet.</Text>}
    </> : null}
    {section==="stocks" ? <>
      <Text style={[s.meta,{color:muted,marginTop:8}]}>NEWSROOM  /  BUSINESS & MARKETS  /  STOCK MARKET</Text>
      <View style={[s.marketHero,{backgroundColor:darkMode?"#102D2B":"#103C36"}]}>
        <View style={s.marketHeroTop}><Text style={s.marketEyebrow}>MALAWI MARKET · INVESTOR DESK</Text><Text style={s.marketBadge}>{liveFlags.stocks?"QUOTES LOADED":"DATA PENDING"}</Text></View>
        <Text style={s.marketHeroTitle}>Understand the market.</Text>
        <Text style={s.marketHeroCopy}>A clearer view of Malawi's listed companies, share prices and market activity.</Text>
        <View style={s.marketStats}>
          <View style={s.marketStat}><Text style={s.marketStatValue}>{stockRows.length}</Text><Text style={s.marketStatLabel}>COUNTERS</Text></View>
          <View style={s.marketStat}><Text style={[s.marketStatValue,{color:"#86E0B1"}]}>{marketStats.gainers}</Text><Text style={s.marketStatLabel}>GAINERS</Text></View>
          <View style={s.marketStat}><Text style={[s.marketStatValue,{color:"#FCA5A5"}]}>{marketStats.decliners}</Text><Text style={s.marketStatLabel}>DECLINERS</Text></View>
          <View style={s.marketStat}><Text style={s.marketStatValue}>{marketStats.unchanged}</Text><Text style={s.marketStatLabel}>UNCHANGED</Text></View>
        </View>
      </View>
      <View style={s.marketSectionHead}><View><Text style={[s.marketSectionTitle,{color:ink}]}>Market watch</Text><Text style={[s.meta,{color:muted}]}>Malawi Stock Exchange · Main Board</Text></View><Pressable onPress={()=>setReloadKey(v=>v+1)} style={s.marketRefresh}><Text style={s.marketRefreshText}>↻ Refresh</Text></Pressable></View>
      <TextInput value={search} onChangeText={setSearch} placeholder="Search company or ticker" placeholderTextColor={muted} style={[s.search,{backgroundColor:surface,borderColor:line,color:ink}]}/>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.marketFilterRow}>{["All","Gainers","Decliners","Unchanged"].map(x=><Pressable key={x} onPress={()=>setStocksFilter(x)} style={[s.marketFilter,stocksFilter===x&&s.marketFilterActive]}><Text style={[s.marketFilterText,stocksFilter===x&&s.marketFilterTextActive]}>{x}</Text></Pressable>)}</ScrollView>
      {filteredStocks.map((item,i)=>{const delta=Number.parseFloat(item.change);const up=delta>0;const down=delta<0;return <View key={item.symbol+"-"+i} style={[s.marketStockRow,{backgroundColor:surface,borderColor:line}]}>
        <View style={[s.marketTickerMark,{backgroundColor:darkMode?"#183D38":"#E6F4EF"}]}><Text style={s.marketTickerMarkText}>{item.symbol.slice(0,2)}</Text></View>
        <View style={{flex:1,minWidth:0}}><Text style={[s.marketSymbol,{color:ink}]}>{item.symbol}</Text><Text numberOfLines={1} style={[s.marketCompany,{color:muted}]}>{item.name}</Text></View>
        <View style={{alignItems:"flex-end",marginLeft:8}}><Text style={[s.marketPrice,{color:ink}]}>{item.price}</Text><Text style={[s.marketChange,{color:up?"#15803D":down?"#DC2626":muted}]}>{item.change}</Text></View>
      </View>;})}
      {!filteredStocks.length?<View style={[s.marketEmpty,{backgroundColor:surface,borderColor:line}]}>
        <View style={s.marketEmptyIcon}><Text style={s.marketEmptyIconText}>MSE</Text></View>
        <Text style={[s.marketEmptyTitle,{color:ink}]}>{stockRows.length?"No matching companies":"Market data has not been published yet"}</Text>
        <Text style={[s.body,{color:muted,textAlign:"center"}]}>{stockRows.length?"Try another ticker or filter.":"The market dashboard is ready, but the quotes database is empty. Verified prices will appear here once an authorized data feed or administrator-published quotes are available."}</Text>
        <Pressable onPress={()=>void openExternal("https://www.mse.co.mw/")} style={s.marketOfficialLink}><Text style={s.marketOfficialLinkText}>VISIT OFFICIAL EXCHANGE ↗</Text></Pressable>
      </View>:null}
      <View style={[s.marketFootnote,{backgroundColor:darkMode?"#252B35":"#F0F5F3"}]}>
        <Text style={[s.marketFootnoteTitle,{color:ink}]}>Data transparency</Text>
        <Text style={[s.meta,{color:muted}]}>Prices are shown only when a source and quote timestamp are recorded. This section does not represent delayed or missing data as live prices.</Text>
        {stockRows.length>0?<Text style={[s.meta,{color:muted}]}>Latest recorded quote: {stockRows.reduce<string>((latest,x)=>{const stamp=x.quoteTime||"";return !latest||(stamp&&new Date(stamp)>new Date(latest))?stamp:latest;},"")}</Text>:null}
        <Pressable onPress={()=>void openExternal("https://www.mse.co.mw/market/reports")}><Text style={s.marketReportLink}>VIEW OFFICIAL MARKET REPORTS ↗</Text></Pressable>
      </View>
    </> : null}
    {section==="exchange" ? <>
      <Text style={[s.meta,{color:muted,marginTop:8}]}>NEWSROOM  /  BUSINESS & MARKETS  /  FOREIGN EXCHANGE</Text>
      <View style={[s.marketHero,{backgroundColor:darkMode?"#102D2B":"#103C36"}]}>
        <View style={s.marketHeroTop}><Text style={s.marketEyebrow}>MALAWI MARKET · CURRENCY DESK</Text><Text style={s.marketBadge}>{exchangeLoading?"UPDATING":exchangeRates.length?"REFERENCE RATES":"DATA UNAVAILABLE"}</Text></View>
        <Text style={s.marketHeroTitle}>The Kwacha, in context.</Text>
        <Text style={s.marketHeroCopy}>Indicative reference exchange rates against major regional and international currencies.</Text>
        <View style={s.marketStats}><View style={s.marketStat}><Text style={s.marketStatValue}>{exchangeRates.length}</Text><Text style={s.marketStatLabel}>CURRENCIES</Text></View><View style={s.marketStat}><Text style={s.marketStatValue}>MWK</Text><Text style={s.marketStatLabel}>REFERENCE BASE</Text></View></View>
      </View>
      <View style={s.marketSectionHead}><View><Text style={[s.marketSectionTitle,{color:ink}]}>Exchange rates</Text><Text style={[s.meta,{color:muted}]}>Malawi Kwacha per 1 unit of foreign currency</Text></View><Pressable onPress={()=>setReloadKey(v=>v+1)} style={s.marketRefresh}><Text style={s.marketRefreshText}>↻ Refresh</Text></Pressable></View>
      {exchangeLoading&&!exchangeRates.length?<View style={[s.statusPanel,{backgroundColor:surface,borderColor:line}]}><Text style={[s.statusTitle,{color:ink}]}>Loading reference rates…</Text><Text style={[s.statusBody,{color:muted}]}>Connecting to the exchange-rate provider.</Text></View>:null}
      {exchangeError?<View style={[s.statusPanel,{backgroundColor:surface,borderColor:line}]}><Text style={[s.statusTitle,{color:ink}]}>Rates unavailable</Text><Text style={[s.statusBody,{color:muted}]}>{exchangeError}</Text><Pressable onPress={()=>setReloadKey(v=>v+1)} style={s.retry}><Text style={s.retryText}>Try again</Text></Pressable></View>:null}
      {exchangeRates.map(rate=><View key={rate.currency} style={[s.exchangeRateRow,{backgroundColor:surface,borderColor:line}]}>
        <View style={[s.exchangeCurrencyMark,{backgroundColor:darkMode?"#183D38":"#E6F4EF"}]}><Text style={s.exchangeCurrencyMarkText}>{rate.currency}</Text></View>
        <View style={{flex:1}}><Text style={[s.marketSymbol,{color:ink}]}>{rate.currency}</Text><Text style={[s.marketCompany,{color:muted}]}>{rate.currency==="USD"?"US Dollar":rate.currency==="GBP"?"British Pound":rate.currency==="EUR"?"Euro":rate.currency==="ZAR"?"South African Rand":rate.currency==="KES"?"Kenyan Shilling":rate.currency==="TZS"?"Tanzanian Shilling":"Botswana Pula"}</Text></View>
        <View style={{alignItems:"flex-end"}}><Text style={[s.marketPrice,{color:ink}]}>MK {rate.mwkPerUnit.toLocaleString("en-MW",{minimumFractionDigits:2,maximumFractionDigits:2})}</Text><Text style={[s.meta,{color:muted}]}>per 1 {rate.currency}</Text></View>
      </View>)}
      {!exchangeRates.length&&!exchangeLoading&&!exchangeError?<Text style={[s.empty,{color:muted}]}>No exchange rates are available.</Text>:null}
      <View style={[s.marketFootnote,{backgroundColor:darkMode?"#252B35":"#F0F5F3"}]}>
        <Text style={[s.marketFootnoteTitle,{color:ink}]}>Source & update time</Text>
        <Text style={[s.meta,{color:muted}]}>Provider: ExchangeRate-API open reference feed. Rates are indicative, update periodically and may differ from bank, bureau or transaction rates.</Text>
        {exchangeUpdatedAt?<Text style={[s.meta,{color:muted}]}>Last provider update: {new Date(exchangeUpdatedAt).toLocaleString()}</Text>:null}
        <Text style={[s.meta,{color:muted}]}>Not a guaranteed buy/sell quote. Confirm the rate with your bank or licensed bureau before exchanging money.</Text>
      </View>
    </> : null}
    {section==="weather" ? <>
      {notice(liveServiceAvailability.weather?"OpenWeather connection configured.":"Weather API key missing from this Expo build.")}
      <View style={s.marketSummary}><Text style={s.summaryLabel}>LOCAL WEATHER</Text><Text style={s.summaryValue}>{weather?.place||"Weather near you"}</Text><Text style={[s.meta,{color:muted}]}>Uses your device location only after you grant permission.</Text></View>
      <Pressable style={s.retry} onPress={()=>void loadCurrentWeather()} disabled={weatherLoading}><Text style={s.retryText}>{weatherLoading?"Getting weather…":"Use my current location"}</Text></Pressable>
      {weatherError?<Text style={s.errorText}>{weatherError}</Text>:null}
      {weather?<View style={[s.weatherCard,{backgroundColor:surface,borderColor:line}]}><Text style={[s.temperature,{color:topic.accent}]}>{weather.temperature}°C</Text><Text style={[s.weatherDescription,{color:topic.accent}]}>{weather.description}</Text><Text style={[s.body,{color:muted}]}>Feels like {weather.feelsLike}°C</Text><View style={s.weatherStats}><Text style={[s.meta,{color:muted}]}>Humidity {weather.humidity}%</Text><Text style={[s.meta,{color:muted}]}>Wind {weather.wind} m/s</Text></View></View>:<Text style={[s.empty,{color:muted}]}>Tap the button to request location access and retrieve live weather.</Text>}
    </> : null}
    {section==="map" ? <>
      <View style={[s.shopFinderHero,{backgroundColor:darkMode?"#182B36":"#EAF3F8"}]}>
        <Text style={[s.shopFinderEyebrow,{color:darkMode?"#A9D5E9":"#3E7188"}]}>MALAWI MARKET · LOCAL DISCOVERY</Text>
        <Text style={[s.shopFinderTitle,{color:ink}]}>Find shops around you.</Text>
        <Text style={[s.body,{color:muted}]}>Search nearby stores, browse by type and get walking directions to a location.</Text>
      </View>
      <Text style={[s.shopFinderLabel,{color:ink}]}>1. Choose an area</Text>
      <TextInput value={mapQuery} onChangeText={setMapQuery} placeholder="Search a town, district or area" placeholderTextColor={muted} style={[s.search,{backgroundColor:surface,borderColor:line,color:ink}]} onSubmitEditing={()=>void findMapPlaces()}/>
      <View style={s.mapActionRow}>
        <Pressable style={[s.mapPrimaryAction,{backgroundColor:topic.accent}]} onPress={()=>void findMapPlaces()} disabled={mapLoading}><Text style={s.mapPrimaryActionText}>{mapLoading?"Searching…":"Find area"}</Text></Pressable>
        <Pressable style={[s.mapSecondaryAction,{borderColor:topic.accent}]} onPress={()=>void useCurrentMapLocation()} disabled={mapLoading}><Text style={[s.mapSecondaryActionText,{color:topic.accent}]}>Use my location</Text></Pressable>
      </View>
      {mapError?<Text style={s.errorText}>{mapError}</Text>:null}
      {mapResults.map((place,i)=><Pressable key={i} style={[s.mapPlaceResult,{backgroundColor:surface,borderColor:line}]} onPress={()=>{const point={latitude:place.latitude,longitude:place.longitude};setCoordinates(point);setLocationLabel(place.name);setMapResults([]);void loadNearbyShops(point,shopCategory,shopQuery);}}><Text style={[s.cardTitle,{color:ink}]}>{place.name}</Text><Text style={[s.meta,{color:muted}]}>Set this as the search area</Text></Pressable>)}
      <View style={s.mapCurrentArea}><Text style={[s.meta,{color:muted}]}>SEARCH AREA</Text><Text style={[s.mapAreaName,{color:ink}]}>{locationLabel}</Text><Text style={[s.meta,{color:muted}]}>5 km search radius</Text></View>
      <Text style={[s.shopFinderLabel,{color:ink}]}>2. What are you looking for?</Text>
      <TextInput value={shopQuery} onChangeText={setShopQuery} placeholder="Shop name or keyword (e.g. supermarket)" placeholderTextColor={muted} style={[s.search,{backgroundColor:surface,borderColor:line,color:ink}]} onSubmitEditing={()=>void loadNearbyShops(coordinates,shopCategory,shopQuery)}/>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.shopCategoryRow}>
        {["All shops","Groceries","Clothing","Electronics","Hardware","Pharmacies","Markets"].map(category=><Pressable key={category} onPress={()=>{setShopCategory(category);void loadNearbyShops(coordinates,category,shopQuery);}} style={[s.shopCategoryPill,{backgroundColor:shopCategory===category?topic.accent:surface,borderColor:shopCategory===category?topic.accent:line}]}><Text style={[s.shopCategoryText,{color:shopCategory===category?"#fff":muted}]}>{category}</Text></Pressable>)}
      </ScrollView>
      <Pressable style={[s.mapFindShops,{backgroundColor:topic.accent}]} onPress={()=>void loadNearbyShops()} disabled={shopsLoading}><Text style={s.mapPrimaryActionText}>{shopsLoading?"Finding shops…":"Find nearby shops"}</Text></Pressable>
      {shopsError?<Text style={s.errorText}>{shopsError}</Text>:null}
      {liveServiceAvailability.mapbox?<><Pressable onPress={()=>void openExternal("https://www.google.com/maps/search/shops/@"+coordinates.latitude+","+coordinates.longitude+",15z")}><Image source={{uri:mapboxStaticImageUrl(coordinates,nearbyShops.map(shop=>({latitude:shop.latitude,longitude:shop.longitude})))}} style={s.mapImage} resizeMode="cover"/></Pressable><Pressable style={[s.mapFindShops,{backgroundColor:surface,borderWidth:1,borderColor:topic.accent}]} onPress={()=>void openExternal("https://www.google.com/maps/search/shops/@"+coordinates.latitude+","+coordinates.longitude+",15z")}><Text style={[s.mapSecondaryActionText,{color:topic.accent}]}>Open zoomable map in Google Maps ↗</Text></Pressable></>:<View style={s.mapPlaceholder}><Text style={[s.body,{color:muted}]}>Map preview is unavailable. Shop results and turn-by-turn directions can still open in your maps app.</Text></View>}
      <Text style={[s.meta,{color:muted,marginTop:7}]}>Map data © OpenStreetMap contributors · Mapbox map imagery</Text>
      <View style={s.mapResultsHeading}><Text style={[s.marketSectionTitle,{color:ink}]}>Nearby shops</Text><Text style={[s.meta,{color:muted}]}>{nearbyShops.length} found</Text></View>
      {nearbyShops.map(shop=><View key={shop.id} style={[s.nearbyShopCard,{backgroundColor:surface,borderColor:line}]}>
        <View style={s.nearbyShopTop}><View style={{flex:1,minWidth:0}}><Text style={[s.nearbyShopName,{color:ink}]}>{shop.name}</Text><Text style={[s.nearbyShopCategory,{color:topic.accent}]}>{shop.category.toUpperCase()}</Text></View><Text style={[s.nearbyShopDistance,{color:muted}]}>{shop.distanceKm<1?Math.round(shop.distanceKm*1000)+" m":shop.distanceKm.toFixed(1)+" km"}</Text></View>
        {shop.address?<Text style={[s.meta,{color:muted,marginTop:6}]}>{shop.address}</Text>:null}
        <Pressable style={[s.nearbyShopDirections,{borderColor:topic.accent}]} onPress={()=>void openShopDirections(shop)}><Text style={[s.nearbyShopDirectionsText,{color:topic.accent}]}>GET DIRECTIONS ↗</Text></Pressable>
      </View>)}
      {!nearbyShops.length&&!shopsLoading&&!shopsError?<Text style={[s.empty,{color:muted}]}>Choose your current location or search for a town, then find nearby shops.</Text>:null}
    </> : null}
  </ScrollView>;
}

const s=StyleSheet.create({
 root:{flex:1,backgroundColor:"#ffffff"},content:{padding:16,paddingBottom:120},back:{paddingVertical:8},backText:{color:orange,fontWeight:"800",fontSize:14},
 title:{fontSize:24,fontWeight:"700",color:"#202124",marginTop:8,letterSpacing:-.5},subtitle:{fontSize:13,color:"#4b5563",lineHeight:20,marginTop:6,marginBottom:16},
 newsMasthead:{borderRadius:4,padding:19,marginTop:12,marginBottom:4},newsMastheadEyebrow:{fontSize:12,fontWeight:"900",letterSpacing:1.4,color:"#B9D0F1"},newsMastheadTitle:{fontSize:27,lineHeight:33,fontWeight:"900",color:"#FFFFFF",letterSpacing:-.8,marginTop:14,maxWidth:310},newsMastheadCopy:{fontSize:12,lineHeight:18,color:"#D6E1F0",marginTop:8},
 businessMarketsPanel:{borderWidth:1,borderRadius:14,padding:13,marginTop:14},businessMarketsHeading:{flexDirection:"row",alignItems:"center",justifyContent:"space-between"},businessMarketsTitle:{fontSize:17,fontWeight:"900"},businessMarketsLabel:{fontSize:12,fontWeight:"900",letterSpacing:1,color:"#0F766E"},businessMarketsActions:{flexDirection:"row",gap:9,marginTop:12},businessMarketAction:{flex:1,minWidth:0,borderWidth:1,borderRadius:11,padding:11},businessMarketEyebrow:{fontSize:12,fontWeight:"900",letterSpacing:1,color:"#0F766E"},businessMarketName:{fontSize:13,fontWeight:"900",marginTop:5},businessMarketLink:{fontSize:12,fontWeight:"900",letterSpacing:.4,color:"#0F766E",marginTop:10},
 newsLeadStory:{padding:17,marginTop:14,borderRadius:4},newsLeadEyebrow:{fontSize:12,fontWeight:"900",letterSpacing:1.1,color:"#F5B77C"},newsLeadTitle:{fontSize:22,lineHeight:28,fontWeight:"900",color:"#FFFFFF",marginTop:12},newsLeadSummary:{fontSize:12,lineHeight:18,color:"#D9E2ED",marginTop:9},newsLeadMeta:{fontSize:12,fontWeight:"700",color:"#B6C6D8",marginTop:13},
 exchangeRateRow:{flexDirection:"row",alignItems:"center",padding:13,borderBottomWidth:1,borderColor:"#E5EAE8",borderRadius:12,marginTop:7},exchangeCurrencyMark:{minWidth:46,height:38,paddingHorizontal:5,borderRadius:9,alignItems:"center",justifyContent:"center",marginRight:11},exchangeCurrencyMarkText:{fontSize:12,fontWeight:"900",color:"#17634F"},
 menuCard:{flexDirection:"row",alignItems:"center",backgroundColor:"#ffffff",borderWidth:1,borderColor:"#d9dde3",borderRadius:13,padding:14,marginTop:8,elevation:0},menuIcon:{width:40,height:40,borderRadius:11,backgroundColor:"#fff1e5",alignItems:"center",justifyContent:"center",marginRight:13},menuTitle:{fontSize:15,fontWeight:"800",color:navy},menuDesc:{fontSize:12,color:"#4b5563",marginTop:4},arrow:{fontSize:26,color:orange,marginLeft:8},
 subheading:{fontSize:15,fontWeight:"900",color:navy,marginTop:24,marginBottom:8},coming:{backgroundColor:"#fff",borderRadius:10,padding:13,marginTop:7,borderWidth:1,borderColor:"#d9dde3"},comingText:{fontSize:12,fontWeight:"700",color:"#465267"},soon:{fontSize:12,color:"#9a6a3a",fontWeight:"900",marginTop:7,letterSpacing:.5},
 statusPanel:{backgroundColor:"#fff",borderRadius:16,padding:16,marginTop:13,borderWidth:1,borderColor:"#e7ebf0"},statusTitle:{fontSize:13,fontWeight:"900",color:navy},statusBody:{fontSize:12,color:"#4b5563",lineHeight:17,marginTop:5},retry:{alignSelf:"flex-start",backgroundColor:orange,borderRadius:8,paddingHorizontal:13,paddingVertical:9,marginTop:10},retryText:{fontSize:12,color:"#fff",fontWeight:"900"},
 notice:{backgroundColor:"#fff1e5",borderRadius:9,padding:11,marginTop:12},noticeText:{fontSize:12,color:"#8a4c19",fontWeight:"800",lineHeight:15},
 search:{height:48,backgroundColor:"#f1f2f4",borderWidth:1,borderColor:"#d9dde3",borderRadius:12,paddingHorizontal:14,marginTop:13,color:"#29292e"},
 pill:{borderRadius:12,borderWidth:1,borderColor:"#cbd1d9",paddingHorizontal:15,paddingVertical:11,minHeight:44,justifyContent:"center",backgroundColor:"#fff"},pillActive:{backgroundColor:orange,borderColor:orange},pillText:{fontSize:12,color:"#4f5a6c",fontWeight:"700"},
 article:{backgroundColor:"#ffffff",padding:14,borderRadius:13,borderWidth:1,borderColor:"#d9dde3",marginTop:11,elevation:0},category:{fontSize:12,fontWeight:"900",color:orange,letterSpacing:.7},cardTitle:{fontSize:15,fontWeight:"800",color:navy,marginTop:8,lineHeight:22},body:{fontSize:12,color:"#4b5563",lineHeight:18,marginTop:5},meta:{fontSize:12,color:"#4b5563",marginTop:8},row:{flexDirection:"row",justifyContent:"space-between",alignItems:"center"},type:{fontSize:12,color:navy,backgroundColor:"#edf1f6",paddingHorizontal:8,paddingVertical:5,borderRadius:6},empty:{textAlign:"center",color:"#4b5563",padding:24,fontSize:12},
 marketHero:{borderRadius:22,padding:19,marginTop:12,overflow:"hidden"},marketHeroTop:{flexDirection:"row",alignItems:"center",justifyContent:"space-between"},marketEyebrow:{fontSize:12,fontWeight:"900",letterSpacing:1.2,color:"#A7D8C8"},marketBadge:{fontSize:12,fontWeight:"900",letterSpacing:.7,color:"#D5F5E8",borderWidth:1,borderColor:"#47776B",borderRadius:6,paddingHorizontal:8,paddingVertical:5},marketHeroTitle:{fontSize:27,lineHeight:32,fontWeight:"900",color:"#FFFFFF",letterSpacing:-.8,marginTop:20},marketHeroCopy:{fontSize:12,lineHeight:18,color:"#D6E8E2",marginTop:8,maxWidth:290},marketStats:{flexDirection:"row",justifyContent:"space-between",gap:8,marginTop:22,paddingTop:14,borderTopWidth:1,borderTopColor:"#37645A"},marketStat:{flex:1},marketStatValue:{fontSize:20,fontWeight:"900",color:"#FFFFFF"},marketStatLabel:{fontSize:12,fontWeight:"900",letterSpacing:.8,color:"#A8CEC1",marginTop:3},marketSectionHead:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",marginTop:20,marginBottom:5},marketSectionTitle:{fontSize:18,fontWeight:"900",letterSpacing:-.4},marketRefresh:{paddingHorizontal:11,paddingVertical:8,borderRadius:16,backgroundColor:"#E6F4EF"},marketRefreshText:{fontSize:12,fontWeight:"900",color:"#145B4B"},marketFilterRow:{gap:8,paddingVertical:12},marketFilter:{paddingHorizontal:14,paddingVertical:9,borderRadius:18,backgroundColor:"#EEF2F1"},marketFilterActive:{backgroundColor:"#145B4B"},marketFilterText:{fontSize:12,fontWeight:"800",color:"#425B53"},marketFilterTextActive:{color:"#FFFFFF"},marketStockRow:{flexDirection:"row",alignItems:"center",padding:13,borderBottomWidth:1,borderColor:"#E5EAE8",borderRadius:12,marginTop:7},marketTickerMark:{width:37,height:37,borderRadius:11,alignItems:"center",justifyContent:"center"},marketTickerMarkText:{fontSize:12,fontWeight:"900",color:"#145B4B"},marketSymbol:{fontSize:12,fontWeight:"900",letterSpacing:.3},marketCompany:{fontSize:12,marginTop:3},marketPrice:{fontSize:12,fontWeight:"900"},marketChange:{fontSize:12,fontWeight:"800",marginTop:3},marketEmpty:{borderWidth:1,borderColor:"#D9E4DF",borderRadius:17,padding:20,alignItems:"center",marginTop:12},marketEmptyIcon:{width:50,height:50,borderRadius:15,backgroundColor:"#E6F4EF",alignItems:"center",justifyContent:"center",marginBottom:13},marketEmptyIconText:{fontSize:12,fontWeight:"900",color:"#145B4B",letterSpacing:1},marketEmptyTitle:{fontSize:14,fontWeight:"900",textAlign:"center"},marketOfficialLink:{marginTop:14,paddingHorizontal:14,paddingVertical:10,borderRadius:9,backgroundColor:"#145B4B"},marketOfficialLinkText:{fontSize:12,fontWeight:"900",letterSpacing:.5,color:"#FFFFFF"},marketFootnote:{borderRadius:14,padding:14,marginTop:15,marginBottom:12},marketFootnoteTitle:{fontSize:12,fontWeight:"900"},marketReportLink:{fontSize:12,fontWeight:"900",letterSpacing:.5,color:"#0F766E",marginTop:12}, marketSummary:{backgroundColor:"#202124",borderRadius:16,padding:18,marginTop:14,marginBottom:9},summaryLabel:{fontSize:12,color:"#ffc18d",fontWeight:"900",letterSpacing:1},summaryValue:{fontSize:19,color:"#fff",fontWeight:"900",marginTop:6},stockRow:{flexDirection:"row",alignItems:"center",backgroundColor:"#fff",padding:14,borderBottomWidth:1,borderColor:"#d9dde3"},stockSymbol:{fontSize:15,fontWeight:"900",color:navy},stockPrice:{fontSize:12,fontWeight:"800",color:navy},
 errorText:{fontSize:12,color:"#b42318",marginTop:10,lineHeight:16},weatherCard:{backgroundColor:"#fff",borderWidth:1,borderColor:"#d9dde3",borderRadius:16,padding:18,marginTop:14},temperature:{fontSize:48,fontWeight:"900",color:navy},weatherDescription:{fontSize:16,fontWeight:"800",color:navy,textTransform:"capitalize",marginTop:4},weatherStats:{flexDirection:"row",justifyContent:"space-between",marginTop:14},shopFinderHero:{borderRadius:20,padding:17,marginTop:12,marginBottom:15},shopFinderEyebrow:{fontSize:12,fontWeight:"900",letterSpacing:1.2},shopFinderTitle:{fontSize:24,fontWeight:"900",letterSpacing:-.6,marginTop:9,marginBottom:6},shopFinderLabel:{fontSize:13,fontWeight:"900",marginTop:13,marginBottom:8},mapActionRow:{flexDirection:"row",gap:9,marginTop:8},mapPrimaryAction:{paddingHorizontal:16,paddingVertical:12,borderRadius:10,alignItems:"center",justifyContent:"center"},mapPrimaryActionText:{fontSize:12,fontWeight:"900",color:"#fff"},mapSecondaryAction:{paddingHorizontal:13,paddingVertical:11,borderRadius:10,borderWidth:1,alignItems:"center",justifyContent:"center"},mapSecondaryActionText:{fontSize:12,fontWeight:"900"},mapPlaceResult:{borderWidth:1,borderRadius:11,padding:12,marginTop:7},mapCurrentArea:{paddingVertical:12,borderBottomWidth:1,borderColor:"#DCE4E9",marginBottom:5},mapAreaName:{fontSize:15,fontWeight:"900",marginTop:4},shopCategoryRow:{gap:7,paddingVertical:11},shopCategoryPill:{paddingHorizontal:12,paddingVertical:9,borderRadius:18,borderWidth:1},shopCategoryText:{fontSize:12,fontWeight:"800"},mapFindShops:{padding:13,borderRadius:11,alignItems:"center",marginTop:3},mapResultsHeading:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",marginTop:17,marginBottom:5},nearbyShopCard:{borderWidth:1,borderRadius:14,padding:13,marginTop:8},nearbyShopTop:{flexDirection:"row",alignItems:"center",gap:8},nearbyShopName:{fontSize:13,fontWeight:"900"},nearbyShopCategory:{fontSize:12,fontWeight:"900",letterSpacing:.7,marginTop:4},nearbyShopDistance:{fontSize:12,fontWeight:"800"},nearbyShopDirections:{alignSelf:"flex-start",borderWidth:1,borderRadius:8,paddingHorizontal:11,paddingVertical:8,marginTop:10},nearbyShopDirectionsText:{fontSize:12,fontWeight:"900",letterSpacing:.4},mapImage:{width:"100%",height:230,borderRadius:14,marginTop:14,backgroundColor:"#eef1f4"},mapPlaceholder:{height:180,alignItems:"center",justifyContent:"center",padding:20,backgroundColor:"#f1f3f5",borderRadius:14,marginTop:14},outlineAction:{borderWidth:1,borderColor:orange,borderRadius:9,padding:11,alignSelf:"flex-start"},outlineActionText:{color:orange,fontWeight:"800",fontSize:12},fixture:{backgroundColor:"#fff",borderWidth:1,borderColor:"#e9edf2",borderRadius:17,padding:16,marginTop:12},sportsHero:{borderRadius:22,padding:19,marginTop:12,overflow:"hidden"},sportsHeroTop:{flexDirection:"row",alignItems:"center",justifyContent:"space-between"},sportsEyebrow:{fontSize:12,fontWeight:"900",letterSpacing:1.4,color:"#9FE3C5"},sportsLiveTag:{fontSize:12,fontWeight:"900",letterSpacing:1,color:"#D1FAE5",borderWidth:1,borderColor:"#4B8D79",borderRadius:5,paddingHorizontal:9,paddingVertical:5},sportsHeroTitle:{fontSize:26,lineHeight:31,fontWeight:"900",color:"#FFFFFF",letterSpacing:-.7,marginTop:20,maxWidth:280},sportsHeroCopy:{fontSize:12,lineHeight:18,color:"#D5E9E2",marginTop:8,maxWidth:300},sportsHeroStats:{flexDirection:"row",gap:28,marginTop:22,paddingTop:14,borderTopWidth:1,borderTopColor:"#37645A"},sportsStatValue:{fontSize:19,fontWeight:"900",color:"#FFFFFF"},sportsStatLabel:{fontSize:12,fontWeight:"900",letterSpacing:1,color:"#A8CEC1",marginTop:3},sportsCategoryRow:{gap:8,paddingVertical:15},sportsCategoryPill:{borderWidth:1,borderColor:"#B7C9C3",borderRadius:18,paddingHorizontal:13,paddingVertical:9,backgroundColor:"#F2F7F5"},sportsCategoryPillActive:{backgroundColor:"#145B4B",borderColor:"#145B4B"},sportsCategoryText:{fontSize:12,fontWeight:"800",color:"#31564B"},sportsCategoryTextActive:{color:"#FFFFFF"},sportsSectionHead:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",marginTop:16,marginBottom:9},sportsSectionTitle:{fontSize:18,fontWeight:"900",letterSpacing:-.4},sportsSectionAccent:{fontSize:12,fontWeight:"900",letterSpacing:1,color:"#0F766E"},sportsTabs:{flexDirection:"row",gap:7,marginBottom:3},sportsTab:{paddingHorizontal:13,paddingVertical:9,borderRadius:18,backgroundColor:"#EEF2F1"},sportsTabActive:{backgroundColor:"#145B4B"},sportsTabText:{fontSize:12,fontWeight:"800",color:"#425B53"},sportsTabTextActive:{color:"#FFFFFF"},sportsFixture:{borderWidth:1,borderRadius:15,padding:14,marginTop:9},sportsFixtureTop:{flexDirection:"row",alignItems:"center",justifyContent:"space-between"},sportsCompetition:{fontSize:12,fontWeight:"900",letterSpacing:.8,color:"#0F766E"},sportsStatus:{fontSize:12,fontWeight:"900",letterSpacing:.5,color:"#64756E"},sportsTeams:{flexDirection:"row",alignItems:"center",gap:7,marginTop:15},sportsTeam:{flex:1,fontSize:12,fontWeight:"900",lineHeight:17},sportsScoreWrap:{alignItems:"center",minWidth:82},sportsScore:{fontSize:16,fontWeight:"900",color:"#0F766E"},sportsTime:{fontSize:12,marginTop:4,textAlign:"center"},sportsFixtureFoot:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",marginTop:11,paddingTop:8,borderTopWidth:1,borderTopColor:"#E5EAE8"},sportsSourceLink:{fontSize:12,fontWeight:"900",color:"#0F766E",letterSpacing:.5},sportsEmpty:{borderWidth:1,borderRadius:14,padding:16,marginTop:10},sportsEmptyTitle:{fontSize:13,fontWeight:"900"},sportsTableRow:{flexDirection:"row",alignItems:"center",gap:12,borderBottomWidth:1,paddingVertical:12,paddingHorizontal:10},sportsPosition:{width:18,fontSize:12,fontWeight:"900"},sportsTableTeam:{fontSize:12,fontWeight:"900"},sportsPoints:{fontSize:12,fontWeight:"900"},fixtureTeams:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",marginTop:12,marginBottom:8},team:{flex:1,fontSize:12,fontWeight:"800",color:navy},score:{fontSize:13,fontWeight:"900",color:orange,paddingHorizontal:8}
});
