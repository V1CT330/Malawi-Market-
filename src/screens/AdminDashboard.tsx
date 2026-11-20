import React,{useEffect,useRef,useState} from "react";
import {ScrollView,View,Text,TextInput,Pressable,StyleSheet,ActivityIndicator,Alert} from "react-native";
import {supabase} from "../lib/supabase";
import {AdminKycReview} from "../components/KycVerification";

type Tab="overview"|"sellers"|"kyc"|"products"|"orders"|"users"|"reports"|"content"|"ads";
type ManagedContent={id:string;kind:"news"|"jobs"|"football";title:string;source:string;created_at:string};
const money=(n:number)=>"MK "+Number(n||0).toLocaleString("en-US");
export function AdminDashboard(){
 const [allowed,setAllowed]=useState(false);const [loading,setLoading]=useState(true);const [busy,setBusy]=useState(false);const actionLock=useRef(false);const [tab,setTab]=useState<Tab>("overview");
 const [stats,setStats]=useState({sellers:0,pending:0,products:0,orders:0,paid:0,revenue:0});
 const [sellers,setSellers]=useState<any[]>([]);const [products,setProducts]=useState<any[]>([]);const [orders,setOrders]=useState<any[]>([]);const [users,setUsers]=useState<any[]>([]);const [reports,setReports]=useState<any[]>([]);const [ads,setAds]=useState<any[]>([]);const [managedContent,setManagedContent]=useState<ManagedContent[]>([]);const [adMetrics,setAdMetrics]=useState<Record<string,{impressions:number;clicks:number}>>({});
 const [contentType,setContentType]=useState<"news"|"jobs"|"stocks"|"football"|"standings">("news");
 const [title,setTitle]=useState("");const [summary,setSummary]=useState("");const [source,setSource]=useState("");const [sourceUrl,setSourceUrl]=useState("");const [category,setCategory]=useState("general");
 const [company,setCompany]=useState("");const [location,setLocation]=useState("");const [description,setDescription]=useState("");const [salary,setSalary]=useState("");const [applicationUrl,setApplicationUrl]=useState("");
 const [symbol,setSymbol]=useState("");const [price,setPrice]=useState("");const [change,setChange]=useState("");const [currency,setCurrency]=useState("MWK");
 const [competition,setCompetition]=useState("TNM Super League");const [home,setHome]=useState("");const [away,setAway]=useState("");const [kickoff,setKickoff]=useState("");const [season,setSeason]=useState("2026");const [team,setTeam]=useState("");const [played,setPlayed]=useState("0");const [won,setWon]=useState("0");const [drawn,setDrawn]=useState("0");const [lost,setLost]=useState("0");const [goalsFor,setGoalsFor]=useState("0");const [goalsAgainst,setGoalsAgainst]=useState("0");const [points,setPoints]=useState("0");const [position,setPosition]=useState("1");
 const load=async()=>{
  setLoading(true);
  try{
   const {data:{user}}=await supabase.auth.getUser();if(!user)throw new Error("Sign in to access administration.");
   const {data:role,error:roleError}=await supabase.rpc("has_role",{_user_id:user.id,_role:"admin"});if(roleError)throw roleError;
   if(role!==true){setAllowed(false);return;}setAllowed(true);
   const [s,p,o,paid,rev,u,rp,n,j,ft]=await Promise.all([
    supabase.from("market_sellers").select("id,name,slug,location,status,is_verified,created_at,auth_user_id").order("created_at",{ascending:false}),
    supabase.from("market_products").select("id,title,price_mwk,status,stock_quantity,created_at,seller:market_sellers(name)").order("created_at",{ascending:false}).limit(100),
    supabase.from("market_orders").select("id,status,payment_status,total_mwk,delivery_name,delivery_phone,delivery_address,created_at").order("created_at",{ascending:false}).limit(100),
    supabase.from("market_orders").select("id",{count:"exact",head:true}).eq("payment_status","paid"),
    supabase.from("market_orders").select("total_mwk").eq("payment_status","paid"),
    supabase.from("profiles").select("id,display_name,phone,location,suspended,created_at").order("created_at",{ascending:false}).limit(200),
    supabase.from("market_reports").select("id,reporter_user_id,target_type,target_id,reason,details,status,created_at").order("created_at",{ascending:false}).limit(100),
    supabase.from("market_news_articles").select("id,title,source_name,created_at,is_published").eq("is_published",true).order("created_at",{ascending:false}).limit(40),
    supabase.from("market_job_listings").select("id,title,company_name,source_name,created_at,is_published").eq("is_published",true).order("created_at",{ascending:false}).limit(40),
    supabase.from("market_football_fixtures").select("id,competition,home_team,away_team,source_name,created_at,is_published").eq("is_published",true).order("created_at",{ascending:false}).limit(40)
   ]);
   if(s.error)throw s.error;if(p.error)throw p.error;if(o.error)throw o.error;if(paid.error)throw paid.error;if(rev.error)throw rev.error;if(u.error)throw u.error;if(rp.error)throw rp.error;if(n.error)throw n.error;if(j.error)throw j.error;if(ft.error)throw ft.error;
   setSellers(s.data??[]);setProducts(p.data??[]);setOrders(o.data??[]);setUsers(u.data??[]);setReports(rp.data??[]);
   setManagedContent([
    ...(n.data??[]).map(x=>({id:x.id,kind:"news" as const,title:x.title,source:x.source_name||"News source",created_at:x.created_at})),
    ...(j.data??[]).map(x=>({id:x.id,kind:"jobs" as const,title:x.title,source:x.company_name||x.source_name||"Employer",created_at:x.created_at})),
    ...(ft.data??[]).map(x=>({id:x.id,kind:"football" as const,title:x.home_team+" vs "+x.away_team,source:x.source_name||x.competition,created_at:x.created_at}))
   ].sort((a,b)=>new Date(b.created_at).getTime()-new Date(a.created_at).getTime()));
   const adResult=await supabase.from("market_ad_campaigns").select("id,business_name,title,placement,budget_mwk,spent_mwk,status,payment_status,created_at").order("created_at",{ascending:false}).limit(200);
   if(adResult.error)throw adResult.error;setAds(adResult.data??[]);
   const eventResult=await supabase.from("market_ad_events").select("campaign_id,event_type").gte("created_at",new Date(Date.now()-30*24*60*60*1000).toISOString()).limit(10000);
   if(eventResult.error)throw eventResult.error;
   const metrics:Record<string,{impressions:number;clicks:number}>={};
   for(const event of eventResult.data??[]){const row=metrics[event.campaign_id]??{impressions:0,clicks:0};if(event.event_type==="impression")row.impressions++;if(event.event_type==="click")row.clicks++;metrics[event.campaign_id]=row;}
   setAdMetrics(metrics);
   setStats({sellers:(s.data??[]).length,pending:(s.data??[]).filter(x=>x.status==="pending").length,products:(p.data??[]).length,orders:(o.data??[]).length,paid:paid.count??0,revenue:(rev.data??[]).reduce((sum,x)=>sum+Number(x.total_mwk),0)});
  }catch(e:any){Alert.alert("Admin dashboard",e?.message||"Could not load administration data.");}
  finally{setLoading(false);}
 };
 useEffect(()=>{void load();},[]);
 const updateSeller=async(id:string,status:"active"|"suspended")=>{
  if(actionLock.current)return;actionLock.current=true;setBusy(true);
  try{
   const seller=sellers.find(x=>x.id===id);if(!seller)throw new Error("Seller record is no longer available. Refresh and try again.");
   if(status==="active"){
    const {data:verification,error:kycError}=await supabase.from("kyc_submissions").select("status").eq("user_id",seller.auth_user_id).order("created_at",{ascending:false}).limit(1).maybeSingle();
    if(kycError)throw kycError;
    if(verification?.status!=="approved"){Alert.alert("KYC approval required","This seller cannot be approved or reactivated until their latest identity verification is approved.");return;}
   }
   const {error}=await supabase.from("market_sellers").update({status,is_verified:status==="active"}).eq("id",id);if(error)throw error;await load();
  }catch(e:any){Alert.alert("Seller update failed",e?.message||"Please try again.");}
  finally{actionLock.current=false;setBusy(false);}
 };
 const updateUserStatus=async(userId:string,suspended:boolean)=>{
  if(actionLock.current)return;actionLock.current=true;setBusy(true);
  try{
   const {error}=await supabase.from("profiles").update({suspended}).eq("id",userId);if(error)throw error;
   if(suspended){
    const sellerResult=await supabase.from("market_sellers").update({status:"suspended",is_verified:false}).eq("auth_user_id",userId).eq("status","active");
    if(sellerResult.error)Alert.alert("Seller access warning",sellerResult.error.message);
   }else{
    const {data:verification,error:kycError}=await supabase.from("kyc_submissions").select("status").eq("user_id",userId).order("created_at",{ascending:false}).limit(1).maybeSingle();
    if(kycError)throw kycError;
    if(verification?.status==="approved"){
     const sellerResult=await supabase.from("market_sellers").update({status:"active",is_verified:true}).eq("auth_user_id",userId).eq("status","suspended");
     if(sellerResult.error)Alert.alert("Seller access warning",sellerResult.error.message);
    }else{
     Alert.alert("Seller remains suspended","The user account is active again, but seller access stays suspended until identity verification is approved.");
    }
   }
   await load();
  }catch(e:any){Alert.alert("User update failed",e?.message||"Please try again.");}
  finally{actionLock.current=false;setBusy(false);}
 };
 const updateReport=async(reportId:string,status:"reviewing"|"resolved"|"dismissed")=>{
  if(actionLock.current)return;actionLock.current=true;setBusy(true);
  try{
   const {data:{user},error:userError}=await supabase.auth.getUser();if(userError)throw userError;if(!user)return;
   const {error}=await supabase.from("market_reports").update({status,reviewed_by:user.id,reviewed_at:new Date().toISOString()}).eq("id",reportId);if(error)throw error;
   await load();
  }catch(e:any){Alert.alert("Report update failed",e?.message||"Please try again.");}
  finally{actionLock.current=false;setBusy(false);}
 };
 const updateProduct=async(id:string,status:"published"|"archived")=>{
  if(actionLock.current)return;actionLock.current=true;setBusy(true);
  try{const {error}=await supabase.from("market_products").update({status,published_at:status==="published"?new Date().toISOString():null}).eq("id",id);if(error)throw error;await load();}
  catch(e:any){Alert.alert("Listing update failed",e?.message||"Please try again.");}
  finally{actionLock.current=false;setBusy(false);}
 };
 const updateAd=async(id:string,status:"paused"|"suspended"|"rejected"|"active")=>{
  if(actionLock.current)return;actionLock.current=true;setBusy(true);
  try{
   const ad=ads.find(x=>x.id===id);if(!ad)throw new Error("Campaign not found. Refresh and retry.");
   if(status==="active"&&ad.payment_status!=="paid")throw new Error("Only paid campaigns can be reactivated.");
   const {error}=await supabase.from("market_ad_campaigns").update({status,updated_at:new Date().toISOString(),admin_note:status==="rejected"?"Rejected by administrator":status==="suspended"?"Suspended by administrator":null}).eq("id",id);
   if(error)throw error;await load();
  }catch(e:any){Alert.alert("Campaign update failed",e?.message||"Please try again.");}
  finally{actionLock.current=false;setBusy(false);}
 };
 const unpublishContent=(record:ManagedContent)=>{
  Alert.alert("Unpublish content?","This removes the item from public Explore screens but keeps its record for administration.",[
   {text:"Keep published",style:"cancel"},
   {text:"Unpublish",style:"destructive",onPress:async()=>{
    if(actionLock.current)return;actionLock.current=true;setBusy(true);
    try{
     let error:any=null;
     if(record.kind==="news"){const result=await supabase.from("market_news_articles").update({is_published:false}).eq("id",record.id);error=result.error;}
     else if(record.kind==="jobs"){const result=await supabase.from("market_job_listings").update({is_published:false}).eq("id",record.id);error=result.error;}
     else{const result=await supabase.from("market_football_fixtures").update({is_published:false}).eq("id",record.id);error=result.error;}
     if(error)throw error;await load();
    }catch(e:any){Alert.alert("Could not unpublish content",e?.message||"Try again.");}
    finally{setBusy(false);actionLock.current=false;}
   }}
  ]);
 };
 const publishContent=async()=>{
  if(actionLock.current)return;actionLock.current=true;setBusy(true);
  try{
   let error:any=null;
   if(contentType==="news"){
    if(title.trim().length<5||source.trim().length<2||!/^https:\/\//i.test(sourceUrl.trim()))throw new Error("News requires a headline, source name and HTTPS source URL.");
    const result=await supabase.from("market_news_articles").insert({title:title.trim(),summary:summary.trim()||null,category:category.trim()||"general",source_name:source.trim(),source_url:sourceUrl.trim(),published_at:new Date().toISOString(),is_published:true});error=result.error;
   }else if(contentType==="jobs"){
    if(title.trim().length<3||company.trim().length<2||description.trim().length<10)throw new Error("Job listings require a title, employer and full description.");
    const result=await supabase.from("market_job_listings").insert({title:title.trim(),company_name:company.trim(),location:location.trim()||null,job_type:"full_time",category:category.trim()||"general",description:description.trim(),salary_range:salary.trim()||null,application_url:applicationUrl.trim()||null,source_name:source.trim()||"Employer submitted",source_url:sourceUrl.trim()||null,is_published:true});error=result.error;
   }else if(contentType==="stocks"){
    const amount=Number(price);if(!symbol.trim()||!company.trim()||!Number.isFinite(amount)||amount<=0||!source.trim())throw new Error("Stock quote requires a symbol, company, valid price and source.");
    const result=await supabase.from("market_stock_quotes").insert({symbol:symbol.trim().toUpperCase(),company_name:company.trim(),price:amount,change_percent:change.trim()?Number(change):null,currency:currency.trim().toUpperCase(),quote_time:new Date().toISOString(),source_name:source.trim(),source_url:sourceUrl.trim()||null});error=result.error;
   }else if(contentType==="football"){
    if(!home.trim()||!away.trim()||!kickoff.trim()||!source.trim()||!/^https:\/\//i.test(sourceUrl.trim()))throw new Error("Fixture requires both teams, kickoff time, source name and HTTPS source URL.");
    const date=new Date(kickoff);if(Number.isNaN(date.getTime()))throw new Error("Enter a valid kickoff date and time.");
    const result=await supabase.from("market_football_fixtures").insert({competition:competition.trim(),home_team:home.trim(),away_team:away.trim(),kickoff_at:date.toISOString(),status:"scheduled",source_name:source.trim(),source_url:sourceUrl.trim(),is_published:true});error=result.error;
   }else{
    const nums=[played,won,drawn,lost,goalsFor,goalsAgainst,points,position].map(Number);
    if(!team.trim()||!season.trim()||!source.trim()||!/^https:\/\//i.test(sourceUrl.trim())||nums.some(x=>!Number.isInteger(x)||x<0))throw new Error("Standings require a team, season, source URL and non-negative whole-number statistics.");
    if(Number(won)+Number(drawn)+Number(lost)!==Number(played))throw new Error("Played must equal wins plus draws plus losses.");
    const result=await supabase.from("market_football_standings").insert({competition:competition.trim(),season:season.trim(),team_name:team.trim(),played:Number(played),won:Number(won),drawn:Number(drawn),lost:Number(lost),goals_for:Number(goalsFor),goals_against:Number(goalsAgainst),points:Number(points),position:Number(position),source_name:source.trim(),source_url:sourceUrl.trim()});error=result.error;
   }
   if(error)throw error;Alert.alert("Published","The verified content record is now available in Explore.");setTitle("");setSummary("");setSource("");setSourceUrl("");setCompany("");setLocation("");setDescription("");setSalary("");setApplicationUrl("");setSymbol("");setPrice("");setChange("");setHome("");setAway("");setKickoff("");setTeam("");setPlayed("0");setWon("0");setDrawn("0");setLost("0");setGoalsFor("0");setGoalsAgainst("0");setPoints("0");setPosition("1");await load();
  }catch(e:any){Alert.alert("Could not publish content",e?.message||"Check the details and try again.");}
  finally{setBusy(false);actionLock.current=false;}
 };
 if(loading)return <View style={s.center}><ActivityIndicator color="#ef7b25"/><Text style={s.meta}>Checking administrator access…</Text></View>;
 if(!allowed)return <View style={s.wrap}><Text style={s.title}>Administrator access required</Text><Text style={s.meta}>This account does not currently have the admin role in Malawi Market. The dashboard is protected by Supabase role checks; a normal seller or buyer cannot approve sellers or moderate listings.</Text></View>;
 const pill=(v:Tab,label:string)=><Pressable key={v} onPress={()=>setTab(v)} style={[s.pill,tab===v&&s.pillActive]}><Text style={[s.pillText,tab===v&&{color:"#fff"}]}>{label}</Text></Pressable>;
 return <ScrollView contentContainerStyle={s.wrap}>
  <Text style={s.title}>Marketplace administration</Text><Text style={s.meta}>Wealth Grid · Malawi Market</Text>
  <View style={s.pills}>{pill("overview","Overview")}{pill("sellers","Sellers")}{pill("kyc","KYC Review")}{pill("products","Listings")}{pill("orders","Orders")}{pill("users","Users")}{pill("reports","Reports")}{pill("content","Content")}{pill("ads","Ads")}</View>
  {tab==="overview"?<><View style={s.stats}>{[["Sellers",stats.sellers],["Pending",stats.pending],["Listings",stats.products],["Orders",stats.orders],["Paid",stats.paid]].map(x=><View key={String(x[0])} style={s.stat}><Text style={s.statValue}>{x[1]}</Text><Text style={s.statLabel}>{x[0]}</Text></View>)}</View><View style={s.revenue}><Text style={s.revenueLabel}>Recorded paid order value</Text><Text style={s.revenueValue}>{money(stats.revenue)}</Text><Text style={s.meta}>This is order value, not seller settlement or platform revenue.</Text></View><Text style={s.section}>Needs attention</Text><Text style={s.meta}>{stats.pending} seller applications pending review.</Text><Text style={s.meta}>{products.filter(x=>x.status==="draft").length} draft listings and {products.filter(x=>x.status==="archived").length} archived listings.</Text></>:null}
  {tab==="sellers"?<><Text style={s.section}>Seller applications and accounts</Text>{sellers.map(x=><View key={x.id} style={s.card}><Text style={s.cardTitle}>{x.name}</Text><Text style={s.meta}>{x.location||"Location not set"} · {x.status.toUpperCase()} · {x.is_verified?"Verified":"Not verified"}</Text><Text style={s.meta}>Submitted {new Date(x.created_at).toLocaleDateString()}</Text><View style={s.actions}>{x.status!=="active"?<Pressable disabled={busy} onPress={()=>void updateSeller(x.id,"active")}><Text style={s.action}>Approve seller</Text></Pressable>:null}{x.status!=="suspended"?<Pressable disabled={busy} onPress={()=>Alert.alert("Suspend seller?","This blocks the seller from publishing and their active products remain hidden by the public listing policy.",[{text:"Cancel",style:"cancel"},{text:"Suspend",style:"destructive",onPress:()=>void updateSeller(x.id,"suspended")}])}><Text style={s.danger}>Suspend</Text></Pressable>:<Pressable disabled={busy} onPress={()=>void updateSeller(x.id,"active")}><Text style={s.action}>Reactivate</Text></Pressable>}</View></View>)}</>:null}
  {!sellers.length?<Text style={s.meta}>No seller applications or accounts to display yet.</Text>:null}
  {tab==="kyc"?<AdminKycReview/>:null}
  {tab==="products"?<><Text style={s.section}>Product moderation</Text>{products.map(x=><View key={x.id} style={s.card}><Text style={s.cardTitle}>{x.title}</Text><Text style={s.meta}>{x.seller?.name||"Seller"} · {money(x.price_mwk)} · Stock {x.stock_quantity} · {x.status.toUpperCase()}</Text><View style={s.actions}><Pressable disabled={busy} onPress={()=>void updateProduct(x.id,x.status==="published"?"archived":"published")}><Text style={s.action}>{x.status==="published"?"Archive listing":"Publish listing"}</Text></Pressable></View></View>)}</>:null}
  {!products.length?<Text style={s.meta}>No product listings to moderate yet.</Text>:null}
  {tab==="users"?<><Text style={s.section}>Marketplace users ({users.length})</Text>{users.map(x=><View key={x.id} style={s.card}><Text style={s.cardTitle}>{x.display_name||"Unnamed user"}</Text><Text style={s.meta}>{x.phone||"No phone"} · {x.location||"Location not set"}</Text><Text style={s.meta}>Account {String(x.id).slice(0,8)} · {x.suspended?"SUSPENDED":"ACTIVE"}</Text><View style={s.actions}><Pressable disabled={busy} onPress={()=>Alert.alert(x.suspended?"Reactivate account?":"Suspend account?","This affects marketplace publishing and purchasing access.",[{text:"Cancel",style:"cancel"},{text:x.suspended?"Reactivate":"Suspend",style:x.suspended?"default":"destructive",onPress:()=>void updateUserStatus(x.id,!x.suspended)}])}><Text style={x.suspended?s.action:s.danger}>{x.suspended?"Reactivate account":"Suspend account"}</Text></Pressable></View></View>)}</>:null}
  {!users.length?<Text style={s.meta}>No marketplace users are available to display.</Text>:null}
  {tab==="reports"?<><Text style={s.section}>User reports ({reports.length})</Text>{reports.map(x=><View key={x.id} style={s.card}><Text style={s.cardTitle}>{x.target_type.toUpperCase()} · {x.reason}</Text><Text style={s.meta}>Report {String(x.id).slice(0,8)} · Target {String(x.target_id).slice(0,8)} · {x.status.toUpperCase()}</Text><Text style={s.meta}>{x.details||"No additional details."}</Text><Text style={s.meta}>Submitted {new Date(x.created_at).toLocaleString()}</Text><View style={s.actions}><Pressable disabled={busy} onPress={()=>void updateReport(x.id,"reviewing")}><Text style={s.action}>Review</Text></Pressable><Pressable disabled={busy} onPress={()=>void updateReport(x.id,"resolved")}><Text style={s.action}>Resolve</Text></Pressable><Pressable disabled={busy} onPress={()=>void updateReport(x.id,"dismissed")}><Text style={s.danger}>Dismiss</Text></Pressable></View></View>)}</>:null}
  {!reports.length?<Text style={s.meta}>No user reports have been submitted.</Text>:null}
  {tab==="orders"?<><Text style={s.section}>Marketplace orders</Text>{orders.map(x=><View key={x.id} style={s.card}><Text style={s.cardTitle}>Order {String(x.id).slice(0,8).toUpperCase()}</Text><Text style={s.meta}>{new Date(x.created_at).toLocaleString()} · {String(x.status).replace(/_/g," ").toUpperCase()}</Text><Text style={s.meta}>Payment {String(x.payment_status).toUpperCase()} · {money(x.total_mwk)}</Text><Text style={s.meta}>{x.delivery_name} · {x.delivery_phone}</Text><Text style={s.meta}>{x.delivery_address}</Text>{x.status==="pending_payment"?<Pressable disabled={busy} onPress={()=>Alert.alert("Cancel unpaid order?","This cancels the order and restores reserved stock. Paid orders cannot be cancelled here.",[{text:"Keep order",style:"cancel"},{text:"Cancel order",style:"destructive",onPress:async()=>{setBusy(true);const {error}=await supabase.rpc("admin_cancel_unpaid_market_order",{p_order_id:x.id});if(error)Alert.alert("Could not cancel",error.message);else await load();setBusy(false);}}])}><Text style={s.danger}>Cancel unpaid order</Text></Pressable>:null}</View>)}</>:null}
  {!orders.length?<Text style={s.meta}>No marketplace orders have been placed yet.</Text>:null}
  {tab==="ads"?<><Text style={s.section}>Advertising campaigns</Text><Text style={s.meta}>Automatic activation follows verified payment. Admin controls can pause, suspend or reject campaigns; unpaid campaigns cannot be activated manually.</Text>{ads.map(x=><View key={x.id} style={s.card}><Text style={s.cardTitle}>{x.title}</Text><Text style={s.meta}>{x.business_name} · {String(x.placement).toUpperCase()}</Text><Text style={s.meta}>Budget {money(x.budget_mwk)} · Spent {money(x.spent_mwk||0)}</Text><Text style={s.meta}>Campaign {String(x.status).toUpperCase()} · Payment {String(x.payment_status).toUpperCase()}</Text><Text style={s.meta}>Last 30 days: {adMetrics[x.id]?.impressions??0} impressions · {adMetrics[x.id]?.clicks??0} clicks</Text><View style={s.actions}>{x.status==="active"?<Pressable disabled={busy} onPress={()=>void updateAd(x.id,"paused")}><Text style={s.danger}>Pause campaign</Text></Pressable>:null}{x.status==="paused"&&x.payment_status==="paid"?<Pressable disabled={busy} onPress={()=>void updateAd(x.id,"active")}><Text style={s.action}>Reactivate</Text></Pressable>:null}{!["rejected","suspended"].includes(x.status)?<Pressable disabled={busy} onPress={()=>Alert.alert("Suspend campaign?","This stops the campaign from being served.",[{text:"Cancel",style:"cancel"},{text:"Suspend",style:"destructive",onPress:()=>void updateAd(x.id,"suspended")}])}><Text style={s.danger}>Suspend</Text></Pressable>:null}{x.status!=="rejected"?<Pressable disabled={busy} onPress={()=>Alert.alert("Reject campaign?","Reject this campaign. This does not automatically refund a completed payment.",[{text:"Cancel",style:"cancel"},{text:"Reject",style:"destructive",onPress:()=>void updateAd(x.id,"rejected")}])}><Text style={s.danger}>Reject</Text></Pressable>:null}</View></View>)}{!ads.length?<Text style={s.meta}>No advertising campaigns yet.</Text>:null}</>:null}
  {tab==="content"?<><Text style={s.section}>Publish verified content</Text><Text style={s.meta}>Only enter information from a reliable source. These entries are published immediately and show the source in the app.</Text><Text style={s.meta}>Automatic publisher-feed imports are disabled until commercial licences are secured. Publish original reporting or material you have written permission to use.</Text><View style={s.pills}>{(["news","jobs","stocks","football","standings"] as const).map(v=><Pressable key={v} onPress={()=>setContentType(v)} style={[s.pill,contentType===v&&s.pillActive]}><Text style={[s.pillText,contentType===v&&{color:"#fff"}]}>{v.toUpperCase()}</Text></Pressable>)}</View>
  {contentType==="news"?<><Text style={s.label}>Headline</Text><TextInput value={title} onChangeText={setTitle} style={s.input}/><Text style={s.label}>Summary</Text><TextInput value={summary} onChangeText={setSummary} style={[s.input,{height:75}]} multiline/><Text style={s.label}>Category</Text><TextInput value={category} onChangeText={setCategory} style={s.input}/><Text style={s.label}>Source name</Text><TextInput value={source} onChangeText={setSource} style={s.input}/><Text style={s.label}>Source URL (HTTPS)</Text><TextInput value={sourceUrl} onChangeText={setSourceUrl} style={s.input} autoCapitalize="none"/></>:null}
  {contentType==="jobs"?<><Text style={s.label}>Job title</Text><TextInput value={title} onChangeText={setTitle} style={s.input}/><Text style={s.label}>Employer</Text><TextInput value={company} onChangeText={setCompany} style={s.input}/><Text style={s.label}>Location</Text><TextInput value={location} onChangeText={setLocation} style={s.input}/><Text style={s.label}>Category</Text><TextInput value={category} onChangeText={setCategory} style={s.input}/><Text style={s.label}>Description</Text><TextInput value={description} onChangeText={setDescription} style={[s.input,{height:100}]} multiline/><Text style={s.label}>Salary range (optional)</Text><TextInput value={salary} onChangeText={setSalary} style={s.input}/><Text style={s.label}>Application URL (optional)</Text><TextInput value={applicationUrl} onChangeText={setApplicationUrl} style={s.input} autoCapitalize="none"/><Text style={s.label}>Source name</Text><TextInput value={source} onChangeText={setSource} style={s.input}/><Text style={s.label}>Source URL (optional)</Text><TextInput value={sourceUrl} onChangeText={setSourceUrl} style={s.input} autoCapitalize="none"/></>:null}
  {contentType==="stocks"?<><Text style={s.label}>Ticker symbol</Text><TextInput value={symbol} onChangeText={setSymbol} style={s.input}/><Text style={s.label}>Company</Text><TextInput value={company} onChangeText={setCompany} style={s.input}/><Text style={s.label}>Latest price</Text><TextInput value={price} onChangeText={setPrice} keyboardType="decimal-pad" style={s.input}/><Text style={s.label}>Change percent</Text><TextInput value={change} onChangeText={setChange} keyboardType="decimal-pad" style={s.input}/><Text style={s.label}>Currency</Text><TextInput value={currency} onChangeText={setCurrency} style={s.input}/><Text style={s.label}>Source name</Text><TextInput value={source} onChangeText={setSource} style={s.input}/><Text style={s.label}>Source URL</Text><TextInput value={sourceUrl} onChangeText={setSourceUrl} style={s.input} autoCapitalize="none"/></>:null}
  {contentType==="football"?<><Text style={s.label}>Competition</Text><TextInput value={competition} onChangeText={setCompetition} style={s.input}/><Text style={s.label}>Home team</Text><TextInput value={home} onChangeText={setHome} style={s.input}/><Text style={s.label}>Away team</Text><TextInput value={away} onChangeText={setAway} style={s.input}/><Text style={s.label}>Kickoff date/time (local)</Text><TextInput value={kickoff} onChangeText={setKickoff} style={s.input} placeholder="2026-12-01 15:00"/><Text style={s.label}>Source name</Text><TextInput value={source} onChangeText={setSource} style={s.input}/><Text style={s.label}>Source URL</Text><TextInput value={sourceUrl} onChangeText={setSourceUrl} style={s.input} autoCapitalize="none"/></>:null}
  {contentType==="standings"?<><Text style={s.label}>Competition</Text><TextInput value={competition} onChangeText={setCompetition} style={s.input}/><Text style={s.label}>Season</Text><TextInput value={season} onChangeText={setSeason} style={s.input}/><Text style={s.label}>Team</Text><TextInput value={team} onChangeText={setTeam} style={s.input}/>{[["Played",played,setPlayed],["Won",won,setWon],["Drawn",drawn,setDrawn],["Lost",lost,setLost],["Goals for",goalsFor,setGoalsFor],["Goals against",goalsAgainst,setGoalsAgainst],["Points",points,setPoints],["Position",position,setPosition]].map(([label,value,setter]:any)=><View key={label}><Text style={s.label}>{label}</Text><TextInput value={value} onChangeText={setter} keyboardType="numeric" style={s.input}/></View>)}<Text style={s.label}>Source name</Text><TextInput value={source} onChangeText={setSource} style={s.input}/><Text style={s.label}>Source URL</Text><TextInput value={sourceUrl} onChangeText={setSourceUrl} style={s.input} autoCapitalize="none"/></>:null}
  <Pressable disabled={busy} style={s.button} onPress={()=>void publishContent()}>{busy?<ActivityIndicator color="#fff"/>:<Text style={s.buttonText}>Publish {contentType}</Text>}</Pressable></>:null}
  {tab==="content"?<>
   <Text style={s.section}>Published content ({managedContent.length})</Text>
   <Text style={s.meta}>Review recently published news, vacancies and football fixtures. Unpublishing hides an item from public screens without deleting its record.</Text>
   {managedContent.map(record=><View key={record.kind+record.id} style={s.card}>
    <Text style={s.cardTitle}>{record.title}</Text>
    <Text style={s.meta}>{record.kind.toUpperCase()} · {record.source} · {new Date(record.created_at).toLocaleDateString()}</Text>
    <View style={s.actions}><Pressable disabled={busy} onPress={()=>unpublishContent(record)}><Text style={s.danger}>Unpublish</Text></Pressable></View>
   </View>)}
   {!managedContent.length?<Text style={s.meta}>No published news, vacancies or fixtures are available to manage.</Text>:null}
  </>:null}
  <Pressable style={s.refresh} onPress={()=>void load()}><Text style={s.refreshText}>Refresh administration data</Text></Pressable>
 </ScrollView>;
}
const s=StyleSheet.create({wrap:{padding:18,paddingBottom:125,backgroundColor:"#f4f6f9"},center:{padding:30,alignItems:"center"},title:{fontSize:27,fontWeight:"900",color:"#252a31",marginTop:10,letterSpacing:-.5},meta:{fontSize:10,color:"#4b5563",lineHeight:16,marginTop:4},pills:{flexDirection:"row",flexWrap:"wrap",gap:7,marginTop:15},pill:{backgroundColor:"#fff",borderWidth:1,borderColor:"#cbd1d9",borderRadius:18,paddingVertical:8,paddingHorizontal:11},pillActive:{backgroundColor:"#f36f21",borderColor:"#f36f21"},pillText:{fontSize:10,fontWeight:"800",color:"#414b59"},stats:{flexDirection:"row",flexWrap:"wrap",gap:8,marginTop:18},stat:{width:"31%",backgroundColor:"#fff",padding:12,borderRadius:10,borderWidth:1,borderColor:"#d9dde3"},statValue:{fontSize:18,fontWeight:"900",color:"#252a31"},statLabel:{fontSize:10,color:"#4b5563",marginTop:4},revenue:{backgroundColor:"#f36f21",padding:16,borderRadius:12,marginTop:12},revenueLabel:{fontSize:10,color:"#ffc18d",fontWeight:"800"},revenueValue:{fontSize:24,color:"#fff",fontWeight:"900",marginTop:5},section:{fontSize:16,fontWeight:"900",color:"#252a31",marginTop:22,marginBottom:7},card:{backgroundColor:"#fff",padding:15,borderRadius:14,borderWidth:0,borderColor:"#d9dde3",marginTop:10,elevation:2,shadowColor:"#252a31",shadowOpacity:.04,shadowRadius:9,shadowOffset:{width:0,height:3}},cardTitle:{fontSize:13,fontWeight:"900",color:"#252a31"},actions:{flexDirection:"row",gap:18,marginTop:10,flexWrap:"wrap"},action:{fontSize:11,color:"#ef7b25",fontWeight:"900"},danger:{fontSize:11,color:"#b42318",fontWeight:"900"},label:{fontSize:11,fontWeight:"800",color:"#414b59",marginTop:13,marginBottom:5},input:{backgroundColor:"#fff",borderWidth:1,borderColor:"#cbd1d9",borderRadius:12,padding:14,fontSize:13,color:"#252a31"},button:{backgroundColor:"#ef7628",padding:15,borderRadius:12,alignItems:"center",marginTop:18,minHeight:46,justifyContent:"center"},buttonText:{color:"#fff",fontWeight:"900"},secondary:{backgroundColor:"#202124",borderWidth:1,borderColor:"#202124",padding:12,borderRadius:9,alignItems:"center",marginTop:12},refresh:{padding:13,alignItems:"center",marginTop:15},refreshText:{fontSize:11,color:"#ef7b25",fontWeight:"900"}});
