import React,{useCallback,useEffect,useState} from "react";
import {ScrollView,View,Text,TextInput,Pressable,StyleSheet,ActivityIndicator,Alert} from "react-native";
import {supabase} from "../lib/supabase";

type Campaign={id:string;business_name:string;title:string;placement:string;budget_mwk:number;status:string;payment_status:string;created_at:string;payment_reference:string|null};
type Payment={reference:string;timed_account_number:string;expires_at:string;amount_mwk:number};
const money=(n:number)=>"MK "+Number(n||0).toLocaleString("en-US");
const placements=["homepage","search","feed","business"] as const;

export function AdvertiserPortal(){
 const [userId,setUserId]=useState("");
 const [email,setEmail]=useState("");
 const [loading,setLoading]=useState(true);
 const [saving,setSaving]=useState(false);
 const [campaigns,setCampaigns]=useState<Campaign[]>([]);
 const [business,setBusiness]=useState("");
 const [title,setTitle]=useState("");
 const [body,setBody]=useState("");
 const [destination,setDestination]=useState("");
 const [image,setImage]=useState("");
 const [budget,setBudget]=useState("5000");
 const [placement,setPlacement]=useState<typeof placements[number]>("homepage");
 const [payment,setPayment]=useState<Payment|null>(null);
 const load=useCallback(async()=>{
  setLoading(true);
  try{
   const {data:{user},error:authError}=await supabase.auth.getUser();
   if(authError)throw authError;
   if(!user){setUserId("");setEmail("");setCampaigns([]);return;}
   setUserId(user.id);setEmail(user.email??"");
   const {data,error}=await supabase.from("market_ad_campaigns").select("id,business_name,title,placement,budget_mwk,status,payment_status,created_at").order("created_at",{ascending:false}).limit(50);
   if(error)throw error;
   setCampaigns((data??[]) as Campaign[]);
  }catch(e:any){Alert.alert("Advertising",e?.message||"Could not load your campaigns.");}
  finally{setLoading(false);}
 },[]);
 useEffect(()=>{void load();},[load]);
 const create=async()=>{
  if(saving)return;
  const amount=Number(budget);
  if(!userId){Alert.alert("Sign in required","Sign in to create an advertising campaign.");return;}
  if(business.trim().length<2||title.trim().length<3||body.trim().length<10||!/^https:\/\//i.test(destination.trim())||!/^https:\/\//i.test(image.trim())||!Number.isSafeInteger(amount)||amount<1000||amount>100000000){
   Alert.alert("Check campaign details","Enter a business name, title, description, HTTPS destination and image URLs, and a budget between MK1,000 and MK100,000,000.");return;
  }
  setSaving(true);
  try{
   const {data,error}=await supabase.from("market_ad_campaigns").insert({advertiser_user_id:userId,business_name:business.trim(),contact_email:email,title:title.trim(),body:body.trim(),destination_url:destination.trim(),image_url:image.trim(),placement,budget_mwk:amount,status:"draft",payment_status:"unpaid"}).select("id").single();
   if(error)throw error;
   const {data:pay,error:payError}=await supabase.functions.invoke("onekhusa-payments",{body:{action:"initiate_ad",campaign_id:data.id}});
   if(payError)throw payError;
   if(pay?.error)throw new Error(pay.error);
   if(!pay?.timed_account_number)throw new Error("OneKhusa did not return a timed account number.");
   setPayment(pay as Payment);
   setBusiness("");setTitle("");setBody("");setDestination("");setImage("");
   await load();
  }catch(e:any){Alert.alert("Campaign payment not started",e?.message||"Your draft may be saved. Refresh campaigns before trying again.");await load();}
  finally{setSaving(false);}
 };
 const resume=async(c:Campaign)=>{
  setSaving(true);
  try{
   const {data,error}=await supabase.functions.invoke("onekhusa-payments",{body:{action:"initiate_ad",campaign_id:c.id}});
   if(error)throw error;if(data?.error)throw new Error(data.error);
   if(!data?.timed_account_number)throw new Error("No payment number returned.");
   setPayment(data as Payment);await load();
  }catch(e:any){Alert.alert("Payment unavailable",e?.message||"Could not start payment.");}
  finally{setSaving(false);}
 };
 if(loading)return <View style={s.center}><ActivityIndicator color="#ef7628"/><Text style={s.meta}>Loading advertiser account…</Text></View>;
 if(!userId)return <View style={s.wrap}><Text style={s.title}>Advertise on Malawi Market</Text><Text style={s.meta}>Sign in to create and manage campaigns. You do not need to be a marketplace seller.</Text></View>;
 return <ScrollView style={s.root} contentContainerStyle={s.wrap}>
  <Text style={s.title}>Advertiser Centre</Text>
  <Text style={s.meta}>External businesses can advertise without opening a seller account. Campaigns activate automatically after a verified OneKhusa payment.</Text>
  {payment?<View style={s.payment}><Text style={s.paymentTitle}>OneKhusa payment request</Text><Text style={s.meta}>Pay this amount using the timed account number. Campaign activation waits for provider confirmation.</Text><Text style={s.label}>Timed account number</Text><Text selectable style={s.tan}>{payment.timed_account_number}</Text><Text style={s.label}>Amount</Text><Text style={s.amount}>{money(payment.amount_mwk)}</Text><Text style={s.meta}>Reference: {payment.reference}</Text><Text style={s.meta}>Expires: {new Date(payment.expires_at).toLocaleString()}</Text><Pressable style={s.secondary} onPress={()=>setPayment(null)}><Text style={s.secondaryText}>Close payment details</Text></Pressable></View>:null}
  <Text style={s.section}>Create a campaign</Text>
  <Text style={s.label}>Business / advertiser name</Text><TextInput value={business} onChangeText={setBusiness} style={s.input} placeholder="Business name"/>
  <Text style={s.label}>Campaign title</Text><TextInput value={title} onChangeText={setTitle} style={s.input} placeholder="What are you promoting?"/>
  <Text style={s.label}>Description</Text><TextInput value={body} onChangeText={setBody} style={[s.input,{height:90,textAlignVertical:"top"}]} multiline placeholder="Describe your offer"/>
  <Text style={s.label}>Destination URL (HTTPS)</Text><TextInput value={destination} onChangeText={setDestination} style={s.input} autoCapitalize="none" keyboardType="url" placeholder="https://example.com"/>
  <Text style={s.label}>Image URL (HTTPS)</Text><TextInput value={image} onChangeText={setImage} style={s.input} autoCapitalize="none" keyboardType="url" placeholder="https://example.com/ad.jpg"/>
  <Text style={s.label}>Placement</Text><View style={s.choices}>{placements.map(p=><Pressable key={p} onPress={()=>setPlacement(p)} style={[s.choice,placement===p&&s.choiceActive]}><Text style={[s.choiceText,placement===p&&s.choiceTextActive]}>{p.toUpperCase()}</Text></Pressable>)}</View>
  <Text style={s.label}>Campaign budget (MWK)</Text><TextInput value={budget} onChangeText={setBudget} style={s.input} keyboardType="number-pad"/>
  <Pressable disabled={saving} style={s.button} onPress={()=>void create()}>{saving?<ActivityIndicator color="#fff"/>:<Text style={s.buttonText}>Create campaign & pay</Text>}</Pressable>
  <Text style={s.meta}>Minimum budget MK1,000. No per-click or per-impression deductions are applied by this campaign form.</Text>
  <Text style={s.section}>Your campaigns</Text>
  {campaigns.length?campaigns.map(c=><View key={c.id} style={s.card}><Text style={s.cardTitle}>{c.title}</Text><Text style={s.meta}>{c.business_name} · {c.placement.toUpperCase()}</Text><Text style={s.price}>{money(c.budget_mwk)}</Text><Text style={s.meta}>Campaign: {c.status.replace(/_/g," ").toUpperCase()} · Payment: {c.payment_status.toUpperCase()}</Text>{c.status==="draft"&&c.payment_status!=="paid"?<Pressable disabled={saving} onPress={()=>void resume(c)}><Text style={s.action}>Continue payment</Text></Pressable>:null}</View>):<Text style={s.meta}>No campaigns created yet.</Text>}
  <Pressable style={s.refresh} onPress={()=>void load()}><Text style={s.action}>Refresh campaigns</Text></Pressable>
 </ScrollView>;
}
const s=StyleSheet.create({root:{flex:1,backgroundColor:"#f4f6f9"},wrap:{padding:18,paddingBottom:130},center:{padding:30,alignItems:"center"},title:{fontSize:26,fontWeight:"900",color:"#252a31"},section:{fontSize:17,fontWeight:"900",color:"#252a31",marginTop:24,marginBottom:8},meta:{fontSize:12,color:"#5d6672",lineHeight:17,marginTop:5},label:{fontSize:12,fontWeight:"800",color:"#414b59",marginTop:12,marginBottom:5},input:{backgroundColor:"#fff",borderWidth:1,borderColor:"#d1d7df",borderRadius:11,padding:13,color:"#252a31",fontSize:13},choices:{flexDirection:"row",flexWrap:"wrap",gap:7},choice:{paddingHorizontal:11,paddingVertical:9,borderWidth:1,borderColor:"#cbd1d9",borderRadius:18,backgroundColor:"#fff"},choiceActive:{backgroundColor:"#ef7628",borderColor:"#ef7628"},choiceText:{fontSize:12,fontWeight:"800",color:"#414b59"},choiceTextActive:{color:"#fff"},button:{backgroundColor:"#155EEF",paddingHorizontal:18,paddingVertical:14,borderRadius:12,alignItems:"center",marginTop:18,minHeight:50,justifyContent:"center"},buttonText:{color:"#fff",fontWeight:"800",fontSize:14},payment:{backgroundColor:"#fff7f0",borderColor:"#f1c29e",borderWidth:1,borderRadius:14,padding:15,marginTop:18},paymentTitle:{fontSize:16,fontWeight:"900",color:"#252a31"},tan:{fontSize:24,fontWeight:"900",color:"#252a31",letterSpacing:1,marginTop:4},amount:{fontSize:22,fontWeight:"900",color:"#ef7628"},secondary:{backgroundColor:"#202124",padding:11,borderRadius:9,alignItems:"center",marginTop:12},secondaryText:{color:"#fff",fontWeight:"800"},card:{backgroundColor:"#fff",padding:14,borderRadius:12,marginTop:10,borderWidth:1,borderColor:"#e2e5e9"},cardTitle:{fontSize:14,fontWeight:"900",color:"#252a31"},price:{fontSize:17,fontWeight:"900",color:"#ef7628",marginTop:6},action:{fontSize:12,color:"#ef7628",fontWeight:"900",marginTop:10},refresh:{padding:14,alignItems:"center"}});
