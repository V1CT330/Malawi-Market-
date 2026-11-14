import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
function serverKey(){const direct=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");if(direct)return direct;const keys=Deno.env.get("SUPABASE_SECRET_KEYS");if(keys){try{return JSON.parse(keys).default;}catch{}}throw new Error("Supabase server secret is unavailable.");}
const url=Deno.env.get("SUPABASE_URL")!;
const admin=createClient(url,serverKey(),{auth:{persistSession:false,autoRefreshToken:false}});
function decode(value:string){return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,"$1").replace(/<[^>]*>/g," ").replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).replace(/\s+/g," ").trim();}
function tag(xml:string,name:string){const m=xml.match(new RegExp("<"+name+"(?:\\s[^>]*)?>([\\s\\S]*?)</"+name+">","i"));return m?decode(m[1]):"";}
async function fetchFeed(feedUrl:string,category:string){
 const response=await fetch(feedUrl,{headers:{"User-Agent":"MalawiMarket/1.0 (+https://malawi-market.vercel.app)","Accept":"application/rss+xml, application/xml, text/xml"}});
 if(!response.ok)throw new Error("RSS source returned HTTP "+response.status+": "+feedUrl);
 const xml=await response.text();const items=[...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map(x=>x[0]);
 return items.slice(0,30).map(item=>{
  const title=tag(item,"title"),link=tag(item,"link"),description=tag(item,"description"),date=tag(item,"pubDate");
  const parsed=new Date(date);return {title,summary:description.slice(0,480)||null,category,source_name:"Malawi24",source_url:link,published_at:Number.isNaN(parsed.getTime())?new Date().toISOString():parsed.toISOString(),is_published:true};
 }).filter(x=>x.title.length>4&&/^https:\/\//i.test(x.source_url));
}
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return json({error:"Use POST."},405);
 try{
  const token=(req.headers.get("Authorization")??"").replace(/^Bearer\s+/i,"");
  if(!token)return json({error:"Sign in as a Malawi Market administrator."},401);
  const {data:{user},error:authError}=await admin.auth.getUser(token);
  if(authError||!user)return json({error:"Your session is invalid. Sign in again."},401);
  const {data:isAdmin,error:roleError}=await admin.rpc("has_role",{_user_id:user.id,_role:"admin"});
  if(roleError||isAdmin!==true)return json({error:"Administrator access required."},403);
  const feeds=[["https://malawi24.com/feed/","general"],["https://malawi24.com/business/feed/","business"]] as const;
  const results=await Promise.allSettled(feeds.map(([feed,category])=>fetchFeed(feed,category)));
  const rows=results.flatMap(r=>r.status==="fulfilled"?r.value:[]);
  if(!rows.length)return json({error:"No articles were returned from the configured Malawi24 RSS feeds.",sources:results.map((r,i)=>({feed:feeds[i][0],status:r.status,error:r.status==="rejected"?String(r.reason):null}))},502);
  const {data,error}=await admin.from("market_news_articles").upsert(rows,{onConflict:"source_url",ignoreDuplicates:false}).select("id");
  if(error)throw error;
  return json({ok:true,received:rows.length,stored:data?.length??0,source:"Malawi24 RSS",synced_at:new Date().toISOString(),feed_status:results.map((r,i)=>({feed:feeds[i][0],ok:r.status==="fulfilled",items:r.status==="fulfilled"?r.value.length:0}))});
 }catch(error){return json({error:error instanceof Error?error.message:"News sync failed."},500);}
});
