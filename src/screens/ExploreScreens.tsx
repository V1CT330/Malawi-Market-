import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { ScrollView, View, Text, TextInput, Pressable, StyleSheet } from "react-native";

type Section = "hub" | "news" | "jobs" | "stocks" | "football";
const orange = "#ef7b25";
const navy = "#172b4d";
const news = [
  { category:"Business", title:"Small businesses explore digital storefronts", summary:"A sample editorial card showing how local commerce stories will appear in Malawi Market.", source:"Malawi Market Editorial", age:"Demo article" },
  { category:"Technology", title:"Mobile-first services reshape everyday shopping", summary:"An illustrative technology story for previewing the news feed layout.", source:"Malawi Market Editorial", age:"Demo article" },
  { category:"Agriculture", title:"Local producers and online marketplaces", summary:"A sample feature about connecting producers with customers across the country.", source:"Malawi Market Editorial", age:"Demo article" },
  { category:"Sports", title:"Community football remains a major attraction", summary:"A sample sports headline used to test category filtering and article cards.", source:"Malawi Market Editorial", age:"Demo article" },
];
const jobs = [
  { title:"Junior Frontend Developer", company:"Demo Technology Studio", location:"Lilongwe", type:"Internship", category:"Technology", salary:"Not specified" },
  { title:"Accounts Assistant", company:"Sample Finance Group", location:"Blantyre", type:"Full time", category:"Finance", salary:"MWK 250,000–350,000" },
  { title:"Agriculture Field Officer", company:"Demo Farm Network", location:"Dedza", type:"Contract", category:"Agriculture", salary:"Negotiable" },
  { title:"Customer Support Agent", company:"Sample Retail Services", location:"Remote", type:"Part time", category:"General", salary:"Not specified" },
];
const stocks = [
  { symbol:"NICO", name:"NICO Holdings", sector:"Financial services", price:"Illustrative", change:"+2.4%" },
  { symbol:"TNM", name:"Telekom Networks Malawi", sector:"Telecommunications", price:"Illustrative", change:"−0.8%" },
  { symbol:"FDHB", name:"FDH Bank", sector:"Banking", price:"Illustrative", change:"+1.1%" },
  { symbol:"AIRTEL", name:"Airtel Malawi", sector:"Telecommunications", price:"Illustrative", change:"+0.5%" },
];
const fixtures: {league:string;home:string;away:string;time:string;score:string;status?:string}[] = [
  { league:"TNM Super League · Demo fixture", home:"Nyasa Big Bullets", away:"Silver Strikers", time:"To be confirmed", score:"— : —" },
  { league:"TNM Super League · Demo fixture", home:"Mighty Wanderers", away:"Civil Service United", time:"To be confirmed", score:"— : —" },
  { league:"National Team · Demo fixture", home:"Malawi", away:"Mozambique", time:"To be confirmed", score:"— : —" },
];
const categories = ["All","Business","Technology","Agriculture","Sports"];
const jobTypes = ["All","Full time","Part time","Contract","Internship"];

export function ExploreScreens() {
  const [section,setSection] = useState<Section>("hub");
  const [newsCategory,setNewsCategory] = useState("All");
  const [jobType,setJobType] = useState("All");
  const [search,setSearch] = useState("");
  const [newsRows,setNewsRows] = useState(news);
  const [jobRows,setJobRows] = useState(jobs);
  const [stockRows,setStockRows] = useState(stocks);
  const [fixtureRows,setFixtureRows] = useState(fixtures);
  const [liveFlags,setLiveFlags] = useState({news:false,jobs:false,stocks:false,football:false});
  const [standings,setStandings] = useState<any[]>([]);
  useEffect(()=>{ let active=true; Promise.all([
    supabase.from("market_news_articles").select("id,title,summary,category,source_name,source_url,published_at").eq("is_published",true).order("published_at",{ascending:false}).limit(40),
    supabase.from("market_job_listings").select("id,title,company_name,location,job_type,category,description,salary_range").eq("is_published",true).order("created_at",{ascending:false}).limit(40),
    supabase.from("market_stock_quotes").select("id,symbol,company_name,price,change_percent,currency,quote_time,source_name").order("quote_time",{ascending:false}).limit(50),
    supabase.from("market_football_fixtures").select("id,competition,home_team,away_team,home_score,away_score,kickoff_at,status,source_name").eq("is_published",true).order("kickoff_at",{ascending:true}).limit(40),
    supabase.from("market_football_standings").select("id,competition,season,team_name,played,won,drawn,lost,goals_for,goals_against,points,position").order("position",{ascending:true}).limit(100)
   ]).then(([n,j,st,ft,table])=>{if(!active)return;
    if(n.data?.length){setNewsRows(n.data.map(x=>({category:x.category,title:x.title,summary:x.summary||"",source:x.source_name,age:new Date(x.published_at).toLocaleDateString()})));setLiveFlags(v=>({...v,news:true}));}
    if(j.data?.length){setJobRows(j.data.map(x=>({title:x.title,company:x.company_name,location:x.location||"Malawi",type:x.job_type.replace(/_/g," ").replace(/\b\w/g,m=>m.toUpperCase()),category:x.category,salary:x.salary_range||"Not specified"})));setLiveFlags(v=>({...v,jobs:true}));}
    if(st.data?.length){const latest=new Map();st.data.forEach(x=>{if(!latest.has(x.symbol))latest.set(x.symbol,x);});setStockRows(Array.from(latest.values()).map(x=>({symbol:x.symbol,name:x.company_name,sector:"Malawi Stock Exchange",price:x.price===null?"Unavailable":x.currency+" "+Number(x.price).toLocaleString(),change:x.change_percent===null?"—":(Number(x.change_percent)>0?"+":"")+Number(x.change_percent).toFixed(2)+"%"})));setLiveFlags(v=>({...v,stocks:true}));}
    if(ft.data?.length){setFixtureRows(ft.data.map(x=>({league:x.competition,home:x.home_team,away:x.away_team,time:new Date(x.kickoff_at).toLocaleString(),score:x.home_score===null||x.away_score===null?"— : —":x.home_score+" : "+x.away_score,status:x.status})));setLiveFlags(v=>({...v,football:true}));}
    if(table.data?.length)setStandings(table.data);
  }).catch(()=>{}); return ()=>{active=false;}; },[]);
  const filteredNews = useMemo(()=>newsRows.filter(x=>(newsCategory==="All"||x.category===newsCategory)&&(!search||x.title.toLowerCase().includes(search.toLowerCase()))),[newsRows,newsCategory,search]);
  const filteredJobs = useMemo(()=>jobRows.filter(x=>(jobType==="All"||x.type===jobType)&&(!search||[x.title,x.company,x.location,x.category].join(" ").toLowerCase().includes(search.toLowerCase()))),[jobRows,jobType,search]);
  const go = (next:Section) => { setSearch(""); setSection(next); };
  const heading = section==="news"?"News":section==="jobs"?"Job vacancies":section==="stocks"?"Malawi Stock Market":section==="football"?"Football":"Explore Malawi Market";
  const pill = (label:string, active:boolean, action:()=>void) => <Pressable key={label} onPress={action} style={[s.pill,active&&s.pillActive]}><Text style={[s.pillText,active&&{color:"#fff"}]}>{label}</Text></Pressable>;
  const notice = (text:string) => <View style={s.notice}><Text style={s.noticeText}>DATA STATUS · {text}</Text></View>;
  return <ScrollView style={s.root} contentContainerStyle={s.content}>
    {section!=="hub" && <Pressable onPress={()=>go("hub")} style={s.back}><Text style={s.backText}>‹  Explore</Text></Pressable>}
    <Text style={s.title}>{heading}</Text>
    {section==="hub" ? <>
      <Text style={s.subtitle}>Discover more services and information from across Malawi.</Text>
      {[
        ["news","📰","News","Stories and updates by category"],
        ["jobs","💼","Job vacancies","Explore sample opportunities"],
        ["stocks","📈","Stocks","Market watchlist and company overview"],
        ["football","⚽","Football","Fixtures, results and league information"],
      ].map(([key,icon,label,desc])=><Pressable key={key} style={s.menuCard} onPress={()=>go(key as Section)}><Text style={s.menuIcon}>{icon}</Text><View style={{flex:1}}><Text style={s.menuTitle}>{label}</Text><Text style={s.menuDesc}>{desc}</Text></View><Text style={s.arrow}>›</Text></Pressable>)}
      <Text style={s.subheading}>Coming in later phases</Text>
      {["Orders & delivery tracking","Seller centre & product publishing","Profile, KYC & account settings","Help centre & support"].map(x=><View key={x} style={s.coming}><Text style={s.comingText}>{x}</Text><Text style={s.soon}>PLANNED</Text></View>)}
    </> : null}
    {section==="news" ? <>
      {notice(liveFlags.news?"Verified articles loaded from Malawi Market content feed.":"Sample articles shown until a verified news feed is connected.")}
      <TextInput value={search} onChangeText={setSearch} placeholder="Search sample headlines" style={s.search}/>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:8,paddingVertical:10}}>{categories.map(c=>pill(c,newsCategory===c,()=>setNewsCategory(c)))}</ScrollView>
      {filteredNews.map((item,i)=><View key={i} style={s.article}><Text style={s.category}>{item.category.toUpperCase()} · {item.age.toUpperCase()}</Text><Text style={s.cardTitle}>{item.title}</Text><Text style={s.body}>{item.summary}</Text><Text style={s.meta}>{item.source}</Text></View>)}
      {!filteredNews.length&&<Text style={s.empty}>No sample articles match your search.</Text>}
    </> : null}
    {section==="jobs" ? <>
      {notice(liveFlags.jobs?"Published job listings from Malawi Market content feed.":"Sample vacancies only; no real employer listings are available yet.")}
      <TextInput value={search} onChangeText={setSearch} placeholder="Search role, company or location" style={s.search}/>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:8,paddingVertical:10}}>{jobTypes.map(c=>pill(c,jobType===c,()=>setJobType(c)))}</ScrollView>
      {filteredJobs.map((item,i)=><View key={i} style={s.article}><View style={s.row}><Text style={s.category}>{item.category.toUpperCase()}</Text><Text style={s.type}>{item.type}</Text></View><Text style={s.cardTitle}>{item.title}</Text><Text style={s.body}>{item.company}</Text><Text style={s.meta}>⌖ {item.location}   ·   {item.salary}</Text><Text style={s.soon}>{liveFlags.jobs?"PUBLISHED LISTING":"DEMO VACANCY"}</Text></View>)}
      {!filteredJobs.length&&<Text style={s.empty}>No sample vacancies match your search.</Text>}
    </> : null}
    {section==="stocks" ? <>
      {notice(liveFlags.stocks?"Latest available quotes from the configured stock data feed.":"Illustrative watchlist only; live exchange quotes are not available yet.")}
      <View style={s.marketSummary}><Text style={s.summaryLabel}>MARKET WATCHLIST</Text><Text style={s.summaryValue}>Malawi Stock Exchange</Text><Text style={s.meta}>Live market data integration is still required.</Text></View>
      {stockRows.map((item,i)=><View key={i} style={s.stockRow}><View style={{flex:1}}><Text style={s.stockSymbol}>{item.symbol}</Text><Text style={s.body}>{item.name}</Text><Text style={s.meta}>{item.sector}</Text></View><View style={{alignItems:"flex-end"}}><Text style={s.stockPrice}>{item.price}</Text><Text style={s.meta}>{item.change}{liveFlags.stocks?" · provider feed":" · illustrative"}</Text></View></View>)}
    </> : null}
    {section==="football" ? <>
      {notice(liveFlags.football?"Fixtures loaded from Malawi Market football data feed.":"Sample fixtures only; live scores and authoritative dates are not available yet.")}
      <View style={s.marketSummary}><Text style={s.summaryLabel}>FOOTBALL CENTRE</Text><Text style={s.summaryValue}>Malawi football</Text><Text style={s.meta}>Fixtures · Results · Competitions</Text></View>
      {fixtureRows.map((item,i)=><View key={i} style={s.fixture}><Text style={s.category}>{item.league.toUpperCase()}</Text><View style={s.fixtureTeams}><Text style={s.team}>{item.home}</Text><Text style={s.score}>{item.score}</Text><Text style={s.team}>{item.away}</Text></View><Text style={s.meta}>{item.time} · {item.status||"demo"}</Text></View>)}
      {standings.length?<><Text style={s.subheading}>League standings</Text>{standings.map((team,i)=><View key={team.id} style={s.stockRow}><Text style={s.stockSymbol}>{team.position}.</Text><View style={{flex:1,marginLeft:10}}><Text style={s.menuTitle}>{team.team_name}</Text><Text style={s.meta}>{team.competition} · {team.season} · P {team.played} · W {team.won} · D {team.drawn} · L {team.lost}</Text></View><Text style={s.stockPrice}>{team.points} pts</Text></View>)}</>:<View style={s.coming}><Text style={s.comingText}>League standings</Text><Text style={s.soon}>AWAITING VERIFIED DATA SOURCE</Text></View> }
    </> : null}
  </ScrollView>;
}

const s=StyleSheet.create({
 root:{flex:1,backgroundColor:"#f7f8fa"},content:{padding:16,paddingBottom:110},back:{paddingVertical:8},backText:{color:orange,fontWeight:"800",fontSize:14},
 title:{fontSize:25,fontWeight:"900",color:navy,marginTop:8},subtitle:{fontSize:13,color:"#687386",lineHeight:20,marginTop:6,marginBottom:16},
 menuCard:{flexDirection:"row",alignItems:"center",backgroundColor:"#fff",borderWidth:1,borderColor:"#e9edf2",borderRadius:13,padding:15,marginTop:10},menuIcon:{fontSize:26,marginRight:13},menuTitle:{fontSize:15,fontWeight:"800",color:navy},menuDesc:{fontSize:11,color:"#788293",marginTop:4},arrow:{fontSize:26,color:orange,marginLeft:8},
 subheading:{fontSize:15,fontWeight:"900",color:navy,marginTop:24,marginBottom:8},coming:{backgroundColor:"#fff",borderRadius:10,padding:13,marginTop:7,borderWidth:1,borderColor:"#edf0f3"},comingText:{fontSize:12,fontWeight:"700",color:"#465267"},soon:{fontSize:9,color:"#9a6a3a",fontWeight:"900",marginTop:7,letterSpacing:.5},
 notice:{backgroundColor:"#fff1e5",borderRadius:9,padding:11,marginTop:12},noticeText:{fontSize:10,color:"#8a4c19",fontWeight:"800",lineHeight:15},
 search:{height:44,backgroundColor:"#fff",borderWidth:1,borderColor:"#e5e9ef",borderRadius:10,paddingHorizontal:13,marginTop:14,color:navy},
 pill:{borderRadius:18,borderWidth:1,borderColor:"#dfe4ea",paddingHorizontal:13,paddingVertical:8,backgroundColor:"#fff"},pillActive:{backgroundColor:navy,borderColor:navy},pillText:{fontSize:11,color:"#4f5a6c",fontWeight:"700"},
 article:{backgroundColor:"#fff",padding:15,borderRadius:12,borderWidth:1,borderColor:"#e9edf2",marginTop:11},category:{fontSize:9,fontWeight:"900",color:orange,letterSpacing:.7},cardTitle:{fontSize:16,fontWeight:"900",color:navy,marginTop:8,lineHeight:22},body:{fontSize:12,color:"#5e6878",lineHeight:18,marginTop:5},meta:{fontSize:10,color:"#8992a0",marginTop:8},row:{flexDirection:"row",justifyContent:"space-between",alignItems:"center"},type:{fontSize:10,color:navy,backgroundColor:"#edf1f6",paddingHorizontal:8,paddingVertical:5,borderRadius:6},empty:{textAlign:"center",color:"#7a8492",padding:24,fontSize:12},
 marketSummary:{backgroundColor:navy,borderRadius:13,padding:17,marginTop:14,marginBottom:8},summaryLabel:{fontSize:9,color:"#ffc18d",fontWeight:"900",letterSpacing:1},summaryValue:{fontSize:19,color:"#fff",fontWeight:"900",marginTop:6},stockRow:{flexDirection:"row",alignItems:"center",backgroundColor:"#fff",padding:14,borderBottomWidth:1,borderColor:"#eef0f3"},stockSymbol:{fontSize:15,fontWeight:"900",color:navy},stockPrice:{fontSize:12,fontWeight:"800",color:navy},
 fixture:{backgroundColor:"#fff",borderWidth:1,borderColor:"#e9edf2",borderRadius:12,padding:14,marginTop:10},fixtureTeams:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",marginTop:12,marginBottom:8},team:{flex:1,fontSize:11,fontWeight:"800",color:navy},score:{fontSize:13,fontWeight:"900",color:orange,paddingHorizontal:8}
});
