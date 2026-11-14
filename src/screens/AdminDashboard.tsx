import React,{useEffect,useState} from "react";
import {ScrollView,View,Text,TextInput,Pressable,StyleSheet,ActivityIndicator,Alert} from "react-native";
import {supabase} from "../lib/supabase";

type Tab="overview"|"sellers"|"products"|"orders"|"content";
const money=(n:number)=>"MK "+Number(n||0).toLocaleString("en-US");
export function AdminDashboard(){
 const [allowed,setAllowed]=useState(false);const [loading,setLoading]=useState(true);const [busy,setBusy]=useState(false);const [syncing,setSyncing]=useState(false);const [tab,setTab]=useState<Tab>("overview");
 const [stats,setStats]=useState({sellers:0,pending:0,products:0,orders:0,paid:0,revenue:0});
 const [sellers,setSellers]=useState<any[]>([]);const [products,setProducts]=useState<any[]>([]);const [orders,setOrders]=useState<any[]>([]);
 const [contentType,setContentType]=useState<"news"|"jobs"|"stocks"|"football">("news");
 const [title,setTitle]=useState("");const [summary,setSummary]=useState("");const [source,setSource]=useState("");const [sourceUrl,setSourceUrl]=useState("");const [category,setCategory]=useState("general");
 const [company,setCompany]=useState("");const [location,setLocation]=useState("");const [description,setDescription]=useState("");const [salary,setSalary]=useState("");const [applicationUrl,setApplicationUrl]=useState("");
 const [symbol,setSymbol]=useState("");const [price,setPrice]=useState("");const [change,setChange]=useState("");const [currency,setCurrency]=useState("MWK");
 const [competition,setCompetition]=useState("TNM Super League");const [home,setHome]=useState("");const [away,setAway]=useState("");const [kickoff,setKickoff]=useState("");
 const load=async()=>{
  setLoading(true);
  try{
   const {data:{user}}=await supabase.auth.getUser();if(!user)throw new Error("Sign in to access administration.");
   const {data:role,error:roleError}=await supabase.rpc("has_role",{_user_id:user.id,_role:"admin"});if(roleError)throw roleError;
   if(role!==true){setAllowed(false);return;}setAllowed(true);
   const [s,p,o,paid,rev]=await Promise.all([
    supabase.from("market_sellers").select("id,name,slug,location,status,is_verified,created_at,auth_user_id").order("created_at",{ascending:false}),
    supabase.from("market_products").select("id,title,price_mwk,status,stock_quantity,created_at,seller:market_sellers(name)").order("created_at",{ascending:false}).limit(100),
    supabase.from("market_orders").select("id,status,payment_status,total_mwk,delivery_name,delivery_phone,delivery_address,created_at").order("created_at",{ascending:false}).limit(100),
    supabase.from("market_orders").select("id",{count:"exact",head:true}).eq("payment_status","paid"),
    supabase.from("market_orders").select("total_mwk").eq("payment_status","paid")
   ]);
   if(s.error)throw s.error;if(p.error)throw p.error;if(o.error)throw o.error;if(paid.error)throw paid.error;if(rev.error)throw rev.error;
   setSellers(s.data??[]);setProducts(p.data??[]);setOrders(o.data??[]);
   setStats({sellers:(s.data??[]).length,pending:(s.data??[]).filter(x=>x.status==="pending").length,products:(p.data??[]).length,orders:(o.data??[]).length,paid:paid.count??0,revenue:(rev.data??[]).reduce((sum,x)=>sum+Number(x.total_mwk),0)});
  }catch(e:any){Alert.alert("Admin dashboard",e?.message||"Could not load administration data.");}
  finally{setLoading(false);}
 };
 useEffect(()=>{void load();},[]);
 const updateSeller=async(id:string,status:"active"|"suspended")=>{
  setBusy(true);const {error}=await supabase.from("market_sellers").update({status,is_verified:status==="active"}).eq("id",id);
  if(error)Alert.alert("Seller update failed",error.message);else await load();setBusy(false);
 };
 const updateProduct=async(id:string,status:"published"|"archived")=>{
  setBusy(true);const {error}=await supabase.from("market_products").update({status,published_at:status==="published"?new Date().toISOString():null}).eq("id",id);
  if(error)Alert.alert("Listing update failed",error.message);else await load();setBusy(false);
 };
 const syncNews=async()=>{
  setSyncing(true);
  try{const {data,error}=await supabase.functions.invoke("market-content-sync",{body:{}});if(error)throw error;if(data?.error)throw new Error(data.error);Alert.alert("News sync complete",String(data.stored??0)+" article records stored from Malawi24.");}
  catch(e:any){Alert.alert("News sync failed",e?.message||"Could not sync RSS articles.");}
  finally{setSyncing(false);}
 };
 const publishContent=async()=>{
  setBusy(true);
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
   }else{
    if(!home.trim()||!away.trim()||!kickoff.trim()||!source.trim()||!/^https:\/\//i.test(sourceUrl.trim()))throw new Error("Fixture requires both teams, kickoff time, source name and HTTPS source URL.");
    const date=new Date(kickoff);if(Number.isNaN(date.getTime()))throw new Error("Enter a valid kickoff date and time.");
    const result=await supabase.from("market_football_fixtures").insert({competition:competition.trim(),home_team:home.trim(),away_team:away.trim(),kickoff_at:date.toISOString(),status:"scheduled",source_name:source.trim(),source_url:sourceUrl.trim(),is_published:true});error=result.error;
   }
   if(error)throw error;Alert.alert("Published","The verified content record is now available in Explore.");setTitle("");setSummary("");setSource("");setSourceUrl("");setCompany("");setLocation("");setDescription("");setSalary("");setApplicationUrl("");setSymbol("");setPrice("");setChange("");setHome("");setAway("");setKickoff("");await load();
  }catch(e:any){Alert.alert("Could not publish content",e?.message||"Check the details and try again.");}
  finally{setBusy(false);}
 };
 if(loading)return <View style={s.center}><ActivityIndicator color="#ef7b25"/><Text style={s.meta}>Checking administrator access…</Text></View>;
 if(!allowed)return <View style={s.wrap}><Text style={s.title}>Administrator access required</Text><Text style={s.meta}>This account does not currently have the admin role in Malawi Market. The dashboard is protected by Supabase role checks; a normal seller or buyer cannot approve sellers or moderate listings.</Text></View>;
 const pill=(v:Tab,label:string)=><Pressable key={v} onPress={()=>setTab(v)} style={[s.pill,tab===v&&s.pillActive]}><Text style={[s.pillText,tab===v&&{color:"#fff"}]}>{label}</Text></Pressable>;
 return <ScrollView contentContainerStyle={s.wrap}>
  <Text style={s.title}>Marketplace administration</Text><Text style={s.meta}>Wealth Grid · Malawi Market</Text>
  <View style={s.pills}>{pill("overview","Overview")}{pill("sellers","Sellers")}{pill("products","Listings")}{pill("orders","Orders")}{pill("content","Content")}</View>
  {tab==="overview"?<><View style={s.stats}>{[["Sellers",stats.sellers],["Pending",stats.pending],["Listings",stats.products],["Orders",stats.orders],["Paid",stats.paid]].map(x=><View key={String(x[0])} style={s.stat}><Text style={s.statValue}>{x[1]}</Text><Text style={s.statLabel}>{x[0]}</Text></View>)}</View><View style={s.revenue}><Text style={s.revenueLabel}>Recorded paid order value</Text><Text style={s.revenueValue}>{money(stats.revenue)}</Text><Text style={s.meta}>This is order value, not seller settlement or platform revenue.</Text></View><Text style={s.section}>Needs attention</Text><Text style={s.meta}>{stats.pending} seller applications pending review.</Text><Text style={s.meta}>{products.filter(x=>x.status==="draft").length} draft listings and {products.filter(x=>x.status==="archived").length} archived listings.</Text></>:null}
  {tab==="sellers"?<><Text style={s.section}>Seller applications and accounts</Text>{sellers.map(x=><View key={x.id} style={s.card}><Text style={s.cardTitle}>{x.name}</Text><Text style={s.meta}>{x.location||"Location not set"} · {x.status.toUpperCase()} · {x.is_verified?"Verified":"Not verified"}</Text><Text style={s.meta}>Submitted {new Date(x.created_at).toLocaleDateString()}</Text><View style={s.actions}>{x.status!=="active"?<Pressable disabled={busy} onPress={()=>void updateSeller(x.id,"active")}><Text style={s.action}>Approve seller</Text></Pressable>:null}{x.status!=="suspended"?<Pressable disabled={busy} onPress={()=>Alert.alert("Suspend seller?","This blocks the seller from publishing and their active products remain hidden by the public listing policy.",[{text:"Cancel",style:"cancel"},{text:"Suspend",style:"destructive",onPress:()=>void updateSeller(x.id,"suspended")}])}><Text style={s.danger}>Suspend</Text></Pressable>:<Pressable disabled={busy} onPress={()=>void updateSeller(x.id,"active")}><Text style={s.action}>Reactivate</Text></Pressable>}</View></View>)}</>:null}
  {tab==="products"?<><Text style={s.section}>Product moderation</Text>{products.map(x=><View key={x.id} style={s.card}><Text style={s.cardTitle}>{x.title}</Text><Text style={s.meta}>{x.seller?.name||"Seller"} · {money(x.price_mwk)} · Stock {x.stock_quantity} · {x.status.toUpperCase()}</Text><View style={s.actions}><Pressable disabled={busy} onPress={()=>void updateProduct(x.id,x.status==="published"?"archived":"published")}><Text style={s.action}>{x.status==="published"?"Archive listing":"Publish listing"}</Text></Pressable></View></View>)}</>:null}
  {tab==="orders"?<><Text style={s.section}>Marketplace orders</Text>{orders.map(x=><View key={x.id} style={s.card}><Text style={s.cardTitle}>Order {String(x.id).slice(0,8).toUpperCase()}</Text><Text style={s.meta}>{new Date(x.created_at).toLocaleString()} · {String(x.status).replace(/_/g," ").toUpperCase()}</Text><Text style={s.meta}>Payment {String(x.payment_status).toUpperCase()} · {money(x.total_mwk)}</Text><Text style={s.meta}>{x.delivery_name} · {x.delivery_phone}</Text><Text style={s.meta}>{x.delivery_address}</Text></View>)}</>:null}
  {tab==="content"?<><Text style={s.section}>Publish verified content</Text><Text style={s.meta}>Only enter information from a reliable source. These entries are published immediately and show the source in the app.</Text><Pressable disabled={syncing} style={s.secondary} onPress={()=>void syncNews()}>{syncing?<ActivityIndicator color="#ef7b25"/>:<Text style={s.refreshText}>Sync Malawi24 RSS news</Text>}</Pressable><View style={s.pills}>{(["news","jobs","stocks","football"] as const).map(v=><Pressable key={v} onPress={()=>setContentType(v)} style={[s.pill,contentType===v&&s.pillActive]}><Text style={[s.pillText,contentType===v&&{color:"#fff"}]}>{v.toUpperCase()}</Text></Pressable>)}</View>
  {contentType==="news"?<><Text style={s.label}>Headline</Text><TextInput value={title} onChangeText={setTitle} style={s.input}/><Text style={s.label}>Summary</Text><TextInput value={summary} onChangeText={setSummary} style={[s.input,{height:75}]} multiline/><Text style={s.label}>Category</Text><TextInput value={category} onChangeText={setCategory} style={s.input}/><Text style={s.label}>Source name</Text><TextInput value={source} onChangeText={setSource} style={s.input}/><Text style={s.label}>Source URL (HTTPS)</Text><TextInput value={sourceUrl} onChangeText={setSourceUrl} style={s.input} autoCapitalize="none"/></>:null}
  {contentType==="jobs"?<><Text style={s.label}>Job title</Text><TextInput value={title} onChangeText={setTitle} style={s.input}/><Text style={s.label}>Employer</Text><TextInput value={company} onChangeText={setCompany} style={s.input}/><Text style={s.label}>Location</Text><TextInput value={location} onChangeText={setLocation} style={s.input}/><Text style={s.label}>Category</Text><TextInput value={category} onChangeText={setCategory} style={s.input}/><Text style={s.label}>Description</Text><TextInput value={description} onChangeText={setDescription} style={[s.input,{height:100}]} multiline/><Text style={s.label}>Salary range (optional)</Text><TextInput value={salary} onChangeText={setSalary} style={s.input}/><Text style={s.label}>Application URL (optional)</Text><TextInput value={applicationUrl} onChangeText={setApplicationUrl} style={s.input} autoCapitalize="none"/><Text style={s.label}>Source name</Text><TextInput value={source} onChangeText={setSource} style={s.input}/><Text style={s.label}>Source URL (optional)</Text><TextInput value={sourceUrl} onChangeText={setSourceUrl} style={s.input} autoCapitalize="none"/></>:null}
  {contentType==="stocks"?<><Text style={s.label}>Ticker symbol</Text><TextInput value={symbol} onChangeText={setSymbol} style={s.input}/><Text style={s.label}>Company</Text><TextInput value={company} onChangeText={setCompany} style={s.input}/><Text style={s.label}>Latest price</Text><TextInput value={price} onChangeText={setPrice} keyboardType="decimal-pad" style={s.input}/><Text style={s.label}>Change percent</Text><TextInput value={change} onChangeText={setChange} keyboardType="decimal-pad" style={s.input}/><Text style={s.label}>Currency</Text><TextInput value={currency} onChangeText={setCurrency} style={s.input}/><Text style={s.label}>Source name</Text><TextInput value={source} onChangeText={setSource} style={s.input}/><Text style={s.label}>Source URL</Text><TextInput value={sourceUrl} onChangeText={setSourceUrl} style={s.input} autoCapitalize="none"/></>:null}
  {contentType==="football"?<><Text style={s.label}>Competition</Text><TextInput value={competition} onChangeText={setCompetition} style={s.input}/><Text style={s.label}>Home team</Text><TextInput value={home} onChangeText={setHome} style={s.input}/><Text style={s.label}>Away team</Text><TextInput value={away} onChangeText={setAway} style={s.input}/><Text style={s.label}>Kickoff date/time (local)</Text><TextInput value={kickoff} onChangeText={setKickoff} style={s.input} placeholder="2026-12-01 15:00"/><Text style={s.label}>Source name</Text><TextInput value={source} onChangeText={setSource} style={s.input}/><Text style={s.label}>Source URL</Text><TextInput value={sourceUrl} onChangeText={setSourceUrl} style={s.input} autoCapitalize="none"/></>:null}
  <Pressable disabled={busy} style={s.button} onPress={()=>void publishContent()}>{busy?<ActivityIndicator color="#fff"/>:<Text style={s.buttonText}>Publish {contentType}</Text>}</Pressable></>:null}
  <Pressable style={s.refresh} onPress={()=>void load()}><Text style={s.refreshText}>Refresh administration data</Text></Pressable>
 </ScrollView>;
}
const s=StyleSheet.create({wrap:{padding:16,paddingBottom:120,backgroundColor:"#f7f8fa"},center:{padding:30,alignItems:"center"},title:{fontSize:23,fontWeight:"900",color:"#172b4d",marginTop:8},meta:{fontSize:10,color:"#788293",lineHeight:16,marginTop:4},pills:{flexDirection:"row",flexWrap:"wrap",gap:7,marginTop:15},pill:{backgroundColor:"#fff",borderWidth:1,borderColor:"#dfe4ea",borderRadius:18,paddingVertical:8,paddingHorizontal:11},pillActive:{backgroundColor:"#172b4d",borderColor:"#172b4d"},pillText:{fontSize:10,fontWeight:"800",color:"#536073"},stats:{flexDirection:"row",flexWrap:"wrap",gap:8,marginTop:18},stat:{width:"31%",backgroundColor:"#fff",padding:12,borderRadius:10,borderWidth:1,borderColor:"#e6eaf0"},statValue:{fontSize:18,fontWeight:"900",color:"#172b4d"},statLabel:{fontSize:10,color:"#788293",marginTop:4},revenue:{backgroundColor:"#172b4d",padding:16,borderRadius:12,marginTop:12},revenueLabel:{fontSize:10,color:"#ffc18d",fontWeight:"800"},revenueValue:{fontSize:24,color:"#fff",fontWeight:"900",marginTop:5},section:{fontSize:16,fontWeight:"900",color:"#172b4d",marginTop:22,marginBottom:7},card:{backgroundColor:"#fff",padding:13,borderRadius:10,borderWidth:1,borderColor:"#e6eaf0",marginTop:9},cardTitle:{fontSize:13,fontWeight:"900",color:"#172b4d"},actions:{flexDirection:"row",gap:18,marginTop:10,flexWrap:"wrap"},action:{fontSize:11,color:"#ef7b25",fontWeight:"900"},danger:{fontSize:11,color:"#b42318",fontWeight:"900"},label:{fontSize:11,fontWeight:"800",color:"#4e5b6e",marginTop:13,marginBottom:5},input:{backgroundColor:"#fff",borderWidth:1,borderColor:"#e2e6ec",borderRadius:9,padding:11,fontSize:12,color:"#172b4d"},button:{backgroundColor:"#ef7b25",padding:14,borderRadius:9,alignItems:"center",marginTop:18,minHeight:46,justifyContent:"center"},buttonText:{color:"#fff",fontWeight:"900"},secondary:{backgroundColor:"#fff",borderWidth:1,borderColor:"#e1e6ed",padding:12,borderRadius:9,alignItems:"center",marginTop:12},refresh:{padding:13,alignItems:"center",marginTop:15},refreshText:{fontSize:11,color:"#ef7b25",fontWeight:"900"}});
