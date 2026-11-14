import React,{useEffect,useState} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {ScrollView,View,Text,TextInput,Pressable,StyleSheet,Switch,Alert,Image,ActivityIndicator} from "react-native";
import * as ImagePicker from "expo-image-picker";
import {supabase} from "../lib/supabase";
import {AuthScreen} from "./AuthScreen";
import {SellerPortal} from "./SellerPortal";
import {AdminDashboard} from "./AdminDashboard";
import {marketText,MarketLanguage} from "../lib/i18n";

const KEY_DRAFTS="@malawi-market/seller-drafts";
const KEY_PROFILE="@malawi-market/profile";
type Draft={id:string;title:string;price:string;category:string;description:string;createdAt:string};
type Profile={displayName:string;phone:string;location:string;language:string;notifications:boolean;avatarUrl:string};
type Notice={id:string;title:string;body:string;kind:string;read_at:string|null;created_at:string};
const initialProfile:Profile={displayName:"",phone:"",location:"",language:"English",notifications:true,avatarUrl:""};
const money=(n:number)=>"MK "+Number(n||0).toLocaleString("en-US");
const tr=(language:string,english:string)=>marketText(language,english);

export function AccountScreens({language,onLanguageChange,passwordRecovery,onPasswordRecoveryComplete}:{language:MarketLanguage;onLanguageChange:(language:MarketLanguage)=>void;passwordRecovery:boolean;onPasswordRecoveryComplete:()=>void}){
 const [screen,setScreen]=useState<"menu"|"seller"|"orders"|"profile"|"settings"|"auth"|"drafts"|"notifications"|"admin">("menu");
 const [drafts,setDrafts]=useState<Draft[]>([]);
 const [profile,setProfile]=useState<Profile>(initialProfile);
 const [orders,setOrders]=useState<any[]>([]);
 const [notifications,setNotifications]=useState<Notice[]>([]);
 const [accountEmail,setAccountEmail]=useState("");
 const [isAdmin,setIsAdmin]=useState(false);
 const [loadingProfile,setLoadingProfile]=useState(false);
 useEffect(()=>{setProfile(v=>({...v,language}));},[language]);
 useEffect(()=>{if(passwordRecovery)setScreen("auth");},[passwordRecovery]);
 const [saving,setSaving]=useState(false);
 const unread=notifications.filter(x=>!x.read_at).length;
 useEffect(()=>{
  void supabase.auth.getSession().then(({data})=>setAccountEmail(data.session?.user.email??""));
  const {data:{subscription}}=supabase.auth.onAuthStateChange((event,session)=>{setAccountEmail(session?.user.email??"");if(event==="PASSWORD_RECOVERY")setScreen("auth");});
  return()=>subscription.unsubscribe();
 },[]);
 useEffect(()=>{void AsyncStorage.getItem(KEY_DRAFTS).then(v=>{if(v)setDrafts(JSON.parse(v));}).catch(()=>{});},[]);
 useEffect(()=>{
  let active=true;
  const load=async()=>{
   if(!accountEmail){setIsAdmin(false);setOrders([]);setNotifications([]);const raw=await AsyncStorage.getItem(KEY_PROFILE);if(active&&raw)try{setProfile({...initialProfile,...JSON.parse(raw)});}catch{}return;}
   setLoadingProfile(true);
   const {data:{user}}=await supabase.auth.getUser();if(!user){setLoadingProfile(false);return;}
   const [p,o,n,a]=await Promise.all([
    supabase.from("profiles").select("display_name,phone,location,avatar_url").eq("id",user.id).maybeSingle(),
    supabase.from("market_orders").select("id,status,payment_status,total_mwk,created_at,payment_reference,market_order_items(product_title,quantity,unit_price_mwk,fulfillment_status),market_payment_attempts(timed_account_number,expires_at,status,provider_reference)").eq("buyer_user_id",user.id).order("created_at",{ascending:false}),
    supabase.from("market_notifications").select("id,title,body,kind,read_at,created_at").eq("user_id",user.id).order("created_at",{ascending:false}).limit(100),
    supabase.rpc("has_role",{_user_id:user.id,_role:"admin"})
   ]);
   if(!active)return;
   const profileData=p.data;if(profileData)setProfile(v=>({...v,displayName:profileData.display_name??"",phone:profileData.phone??"",location:profileData.location??"",avatarUrl:profileData.avatar_url??""}));
   if(o.data)setOrders(o.data);if(n.data)setNotifications(n.data);setIsAdmin(a.data===true);setLoadingProfile(false);
  };
  void load();
  return()=>{active=false;};
 },[accountEmail]);
 useEffect(()=>{
  if(!accountEmail)return;
  let channel:any;
  void supabase.auth.getUser().then(({data:{user}})=>{
   if(!user)return;
   channel=supabase.channel("market-notifications-"+user.id).on("postgres_changes",{event:"*",schema:"public",table:"market_notifications",filter:"user_id=eq."+user.id},payload=>{
    if(payload.eventType==="INSERT")setNotifications(v=>[payload.new as Notice,...v].slice(0,100));
    else if(payload.eventType==="UPDATE")setNotifications(v=>v.map(x=>x.id===payload.new.id?payload.new as Notice:x));
   }).subscribe();
  });
  return()=>{if(channel)void supabase.removeChannel(channel);};
 },[accountEmail]);
 const persistDrafts=async(next:Draft[])=>{setDrafts(next);await AsyncStorage.setItem(KEY_DRAFTS,JSON.stringify(next));};
 const saveProfile=async()=>{
  setSaving(true);
  try{
   const {data:{user}}=await supabase.auth.getUser();
   if(user){const {error}=await supabase.from("profiles").upsert({id:user.id,display_name:profile.displayName.trim()||null,phone:profile.phone.trim()||null,location:profile.location.trim()||null,avatar_url:profile.avatarUrl||null,updated_at:new Date().toISOString()},{onConflict:"id"});if(error)throw error;}
   await AsyncStorage.setItem(KEY_PROFILE,JSON.stringify(profile));Alert.alert("Profile saved","Your profile details have been saved.");
  }catch(e:any){Alert.alert("Could not save profile",e?.message||"Try again.");}
  finally{setSaving(false);}
 };
 const uploadAvatar=async()=>{
  const {data:{user}}=await supabase.auth.getUser();if(!user){Alert.alert("Sign in required","Sign in before uploading a profile photo.");return;}
  const result=await ImagePicker.launchImageLibraryAsync({mediaTypes:["images"],allowsEditing:true,aspect:[1,1],quality:.8});
  if(result.canceled||!result.assets[0])return;const asset=result.assets[0];
  if(asset.fileSize&&asset.fileSize>5*1024*1024){Alert.alert("Image too large","Choose an image under 5 MB.");return;}
  setSaving(true);
  try{const response=await fetch(asset.uri);if(!response.ok)throw new Error("Could not read selected image.");const bytes=await response.arrayBuffer();const mime=asset.mimeType==="image/png"?"image/png":asset.mimeType==="image/webp"?"image/webp":"image/jpeg";const ext=mime==="image/png"?"png":mime==="image/webp"?"webp":"jpg";const path=user.id+"/profile/avatar-"+Date.now()+"."+ext;const {error}=await supabase.storage.from("market-media").upload(path,bytes,{contentType:mime,upsert:false});if(error)throw error;const url=supabase.storage.from("market-media").getPublicUrl(path).data.publicUrl;setProfile(v=>({...v,avatarUrl:url}));}
  catch(e:any){Alert.alert("Upload failed",e?.message||"Could not upload profile photo.");}
  finally{setSaving(false);}
 };
 const markRead=async(id:string)=>{const now=new Date().toISOString();const {error}=await supabase.from("market_notifications").update({read_at:now}).eq("id",id);if(error)Alert.alert("Could not update notification",error.message);else setNotifications(v=>v.map(x=>x.id===id?{...x,read_at:now}:x));};
 const markAllRead=async()=>{const {data:{user}}=await supabase.auth.getUser();if(!user)return;const now=new Date().toISOString();const {error}=await supabase.from("market_notifications").update({read_at:now}).eq("user_id",user.id).is("read_at",null);if(error)Alert.alert("Could not update notifications",error.message);else setNotifications(v=>v.map(x=>({...x,read_at:x.read_at??now})));};
 const back=()=>setScreen("menu");
 const header=(name:string)=><><Pressable onPress={back} style={s.back}><Text style={s.backText}>‹  Account</Text></Pressable><Text style={s.title}>{tr(profile.language,name)}</Text></>;
 const row=(icon:string,name:string,desc:string,action:()=>void)=><Pressable onPress={action} style={s.menuRow}><Text style={s.icon}>{icon}</Text><View style={{flex:1}}><Text style={s.menuTitle}>{tr(profile.language,name)}</Text><Text style={s.meta}>{desc}</Text></View><Text style={s.arrow}>›</Text></Pressable>;
 return <ScrollView style={s.root} contentContainerStyle={s.content}>
 {screen==="menu"&&<><Text style={s.title}>{tr(profile.language,"Your account")}</Text><Text style={s.subtitle}>Manage your marketplace activity and personal details.</Text>
  <View style={s.profileCard}>{profile.avatarUrl?<Image source={{uri:profile.avatarUrl}} style={s.avatarImage}/>:<Text style={s.avatar}>👤</Text>}<View style={{flex:1}}><Text style={s.menuTitle}>{profile.displayName||"Marketplace shopper"}</Text><Text style={s.meta}>{accountEmail||"Not signed in"} · {profile.location||"Location not set"}</Text></View>{isAdmin?<Text style={s.adminTag}>ADMIN</Text>:null}</View>
  {row("♙",accountEmail?"Signed in":"Sign in / Register",accountEmail||"Unlock buyer and seller account features",()=>setScreen("auth"))}
  {row("▣","Seller Centre","Apply, manage your store and publish products",()=>setScreen("seller"))}
  {row("▤","Orders","View purchases and delivery progress",()=>setScreen("orders"))}
  {row("♧","Notifications",unread?unread+" unread notifications":"Order and account updates",()=>setScreen("notifications"))}
  {row("♙","Profile","Manage your account details and profile photo",()=>setScreen("profile"))}
  {row("⚙","Settings","Notifications and language preferences",()=>setScreen("settings"))}
  {isAdmin?row("▦","Admin dashboard","Moderate sellers, products, orders and content",()=>setScreen("admin")):null}
  {row("▤","Saved drafts","Local seller drafts on this device",()=>setScreen("drafts"))}
  {accountEmail?<Pressable style={s.menuRow} onPress={()=>Alert.alert("Sign out?","You will need to sign in again to access account features.",[{text:"Cancel"},{text:"Sign out",style:"destructive",onPress:()=>void supabase.auth.signOut()}])}><Text style={s.menuTitle}>Sign out of {accountEmail}</Text></Pressable>:null}
 </>}
 {screen==="auth"&&<AuthScreen initialMode={passwordRecovery?"reset":"signin"} onBack={back} onDone={()=>{setScreen("menu");onPasswordRecoveryComplete();}}/>}
 {screen==="seller"&&<SellerPortal/>}
 {screen==="admin"&&<AdminDashboard/>}
 {screen==="drafts"&&<>{header("Saved drafts")}{drafts.length?drafts.map(d=><View key={d.id} style={s.card}><Text style={s.menuTitle}>{d.title}</Text><Text style={s.price}>{money(Number(d.price)||0)} · {d.category}</Text><Text style={s.meta}>{d.description||"No description"}</Text><Pressable onPress={()=>Alert.alert("Delete draft?","Remove this saved draft from this device?",[{text:"Cancel"},{text:"Delete",style:"destructive",onPress:()=>void persistDrafts(drafts.filter(x=>x.id!==d.id))}])}><Text style={s.delete}>Delete draft</Text></Pressable></View>):<Text style={s.empty}>No saved drafts on this device.</Text>}</>}
 {screen==="orders"&&<>{header("Order history")}{loadingProfile?<ActivityIndicator color="#ef7b25"/>:orders.length?orders.map(o=><View key={o.id} style={s.card}><Text style={s.menuTitle}>Order {String(o.id).slice(0,8).toUpperCase()}</Text><Text style={s.meta}>{new Date(o.created_at).toLocaleString()} · {String(o.status).replace(/_/g," ").toUpperCase()}</Text><Text style={s.meta}>Payment: {String(o.payment_status||"unpaid").replace(/_/g," ").toUpperCase()}</Text><Text style={s.price}>{money(Number(o.total_mwk))}</Text>{(o.market_order_items??[]).map((item:any)=><Text key={item.product_title+item.quantity} style={s.meta}>{item.quantity} × {item.product_title} · {String(item.fulfillment_status).replace(/_/g," ")}</Text>)}{(o.market_payment_attempts??[]).map((attempt:any)=><View key={attempt.provider_reference}><Text style={s.meta}>OneKhusa: {attempt.status}{attempt.timed_account_number?" · TAN "+attempt.timed_account_number:""}</Text>{attempt.expires_at?<Text style={s.meta}>TAN expires: {new Date(attempt.expires_at).toLocaleString()}</Text>:null}</View>)}{o.status==="pending_payment"?<><Pressable onPress={async()=>{const {data,error}=await supabase.functions.invoke("onekhusa-payments",{body:{action:"initiate",order_id:o.id}});if(error||data?.error)Alert.alert("Payment unavailable",data?.error||error?.message||"Try again later.");else Alert.alert("OneKhusa TAN",String(data.timed_account_number)+"\nAmount: "+money(data.amount_mwk)+"\nExpires: "+new Date(data.expires_at).toLocaleString());}}><Text style={s.action}>Get / refresh payment TAN</Text></Pressable><Pressable onPress={()=>Alert.alert("Cancel unpaid order?","This releases reserved stock.",[{text:"Keep order",style:"cancel"},{text:"Cancel order",style:"destructive",onPress:async()=>{const {error}=await supabase.rpc("cancel_market_order",{p_order_id:o.id});if(error)Alert.alert("Could not cancel",error.message);else setOrders(v=>v.map(x=>x.id===o.id?{...x,status:"cancelled",payment_status:"cancelled"}:x));}}])}><Text style={s.delete}>Cancel unpaid order</Text></Pressable></>:null}</View>):<Text style={s.empty}>Your purchases and delivery updates will appear here.</Text>}</>}
 {screen==="notifications"&&<>{header("Notifications")}<View style={s.actionsRow}><Text style={s.meta}>{unread} unread</Text><Pressable onPress={()=>void markAllRead()}><Text style={s.action}>Mark all read</Text></Pressable></View>{notifications.length?notifications.map(n=><Pressable key={n.id} onPress={()=>!n.read_at&&void markRead(n.id)} style={[s.card,!n.read_at&&s.unreadCard]}><View style={s.actionsRow}><Text style={s.menuTitle}>{n.title}</Text><Text style={s.meta}>{new Date(n.created_at).toLocaleString()}</Text></View><Text style={s.meta}>{n.body}</Text>{!n.read_at?<Text style={s.action}>Tap to mark as read</Text>:null}</Pressable>):<Text style={s.empty}>No notifications yet. Order and account updates will appear here.</Text>}</>}
 {screen==="profile"&&<>{header("Profile")}<View style={s.avatarBlock}>{profile.avatarUrl?<Image source={{uri:profile.avatarUrl}} style={s.largeAvatar}/>:<Text style={s.largeAvatarPlaceholder}>👤</Text>}<Pressable style={s.secondary} disabled={saving} onPress={()=>void uploadAvatar()}><Text style={s.secondaryText}>Upload profile photo</Text></Pressable></View><Text style={s.label}>Display name</Text><TextInput value={profile.displayName} onChangeText={v=>setProfile(p=>({...p,displayName:v}))} style={s.input} placeholder="Your name"/><Text style={s.label}>Phone number</Text><TextInput value={profile.phone} onChangeText={v=>setProfile(p=>({...p,phone:v}))} style={s.input} keyboardType="phone-pad" placeholder="+265"/><Text style={s.label}>City / District</Text><TextInput value={profile.location} onChangeText={v=>setProfile(p=>({...p,location:v}))} style={s.input} placeholder="Lilongwe"/><Pressable disabled={saving} style={s.primary} onPress={()=>void saveProfile()}>{saving?<ActivityIndicator color="#fff"/>:<Text style={s.primaryText}>Save profile</Text>}</Pressable><Text style={s.noteText}>Sign in to sync profile details across devices. Guest profile data stays on this device.</Text></>}
 {screen==="settings"&&<>{header("Settings")}<View style={s.settingRow}><View style={{flex:1}}><Text style={s.menuTitle}>Notifications</Text><Text style={s.meta}>In-app notification preference</Text></View><Switch value={profile.notifications} onValueChange={v=>{setProfile(p=>({...p,notifications:v}));void AsyncStorage.setItem(KEY_PROFILE,JSON.stringify({...profile,notifications:v}));}} trackColor={{true:"#ef7b25"}}/></View><Text style={s.label}>Language</Text><View style={s.pills}>{["English","Chichewa","Tumbuka"].map(v=><Pressable key={v} onPress={()=>{setProfile(p=>({...p,language:v}));onLanguageChange(v as MarketLanguage);void AsyncStorage.setItem(KEY_PROFILE,JSON.stringify({...profile,language:v}));}} style={[s.pill,profile.language===v&&s.pillActive]}><Text style={[s.pillText,profile.language===v&&{color:"#fff"}]}>{v}</Text></Pressable>)}</View><Text style={s.noteText}>Language preference is saved on this device. Marketplace-wide translations are being rolled out.</Text></>}
 </ScrollView>;
}
const s=StyleSheet.create({root:{flex:1,backgroundColor:"#f7f8fa"},content:{padding:16,paddingBottom:105},title:{fontSize:25,fontWeight:"900",color:"#172b4d",marginTop:8,marginBottom:8},subtitle:{fontSize:12,color:"#778293",marginBottom:14},back:{paddingVertical:8},backText:{color:"#ef7b25",fontWeight:"800"},profileCard:{backgroundColor:"#172b4d",borderRadius:13,padding:15,flexDirection:"row",alignItems:"center",gap:12,marginBottom:12},avatar:{fontSize:28},avatarImage:{width:42,height:42,borderRadius:22},adminTag:{fontSize:9,color:"#ffc18d",fontWeight:"900"},menuRow:{backgroundColor:"#fff",borderRadius:11,padding:14,marginTop:9,flexDirection:"row",alignItems:"center",gap:12,borderWidth:1,borderColor:"#e9edf2"},icon:{fontSize:22,color:"#ef7b25",width:28,textAlign:"center"},menuTitle:{fontSize:14,fontWeight:"800",color:"#172b4d"},meta:{fontSize:10,color:"#7d8795",marginTop:4,lineHeight:15},arrow:{fontSize:23,color:"#ef7b25"},card:{backgroundColor:"#fff",padding:14,borderRadius:10,borderWidth:1,borderColor:"#e9edf2",marginTop:9},unreadCard:{borderColor:"#ef7b25",borderLeftWidth:3},price:{fontSize:13,fontWeight:"900",color:"#ef7b25",marginTop:6},action:{fontSize:11,color:"#ef7b25",fontWeight:"900",marginTop:10},delete:{fontSize:11,color:"#c44",fontWeight:"800",marginTop:12},empty:{fontSize:12,color:"#7d8795",textAlign:"center",padding:24},label:{fontSize:11,fontWeight:"800",color:"#4e5b6e",marginTop:15,marginBottom:6},input:{backgroundColor:"#fff",borderWidth:1,borderColor:"#e2e6ec",borderRadius:9,padding:12,fontSize:13,color:"#172b4d"},primary:{backgroundColor:"#ef7b25",padding:14,borderRadius:9,alignItems:"center",marginTop:15,minHeight:46,justifyContent:"center"},primaryText:{color:"#fff",fontWeight:"900",fontSize:12},secondary:{backgroundColor:"#fff",borderWidth:1,borderColor:"#e1e6ed",padding:12,borderRadius:9,alignItems:"center",marginTop:9},secondaryText:{color:"#172b4d",fontSize:11,fontWeight:"800"},avatarBlock:{alignItems:"center",marginTop:15},largeAvatar:{width:104,height:104,borderRadius:52},largeAvatarPlaceholder:{fontSize:70},settingRow:{backgroundColor:"#fff",padding:14,borderRadius:10,flexDirection:"row",alignItems:"center",marginTop:12},pills:{flexDirection:"row",gap:8,flexWrap:"wrap"},pill:{borderWidth:1,borderColor:"#dfe4ea",paddingVertical:9,paddingHorizontal:12,borderRadius:18,backgroundColor:"#fff"},pillActive:{backgroundColor:"#172b4d",borderColor:"#172b4d"},pillText:{fontSize:11,fontWeight:"700",color:"#536073"},noteText:{fontSize:10,color:"#854d22",fontWeight:"700",lineHeight:16,marginTop:14},actionsRow:{flexDirection:"row",justifyContent:"space-between",alignItems:"center"}});
