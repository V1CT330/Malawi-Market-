import React, { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ScrollView, View, Text, TextInput, Pressable, StyleSheet, Switch, Alert } from "react-native";
import { supabase } from "../lib/supabase";
import { AuthScreen } from "./AuthScreen";
import { SellerPortal } from "./SellerPortal";

const KEY_DRAFTS="@malawi-market/seller-drafts";
const KEY_PROFILE="@malawi-market/profile";
const KEY_ORDERS="@malawi-market/orders";
type Draft={id:string;title:string;price:string;category:string;description:string;createdAt:string};
type Profile={displayName:string;phone:string;location:string;language:string;notifications:boolean};
const initialProfile:Profile={displayName:"Guest shopper",phone:"",location:"",language:"English",notifications:true};
const money=(n:number)=>"MK "+n.toLocaleString("en-US");

export function AccountScreens(){
 const [screen,setScreen]=useState<"menu"|"seller"|"orders"|"profile"|"settings"|"auth"|"drafts">("menu");
 const [drafts,setDrafts]=useState<Draft[]>([]);
 const [profile,setProfile]=useState<Profile>(initialProfile);
 const [title,setTitle]=useState(""); const [price,setPrice]=useState(""); const [category,setCategory]=useState("Electronics"); const [description,setDescription]=useState("");
 const [orders,setOrders]=useState<any[]>([]);
 const [sort,setSort]=useState("newest");
 const [accountEmail,setAccountEmail]=useState("");
 useEffect(()=>{ void supabase.auth.getSession().then(({data})=>setAccountEmail(data.session?.user.email??"")); const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,session)=>setAccountEmail(session?.user.email??"")); return ()=>subscription.unsubscribe(); },[]);
 useEffect(()=>{AsyncStorage.multiGet([KEY_DRAFTS,KEY_PROFILE,KEY_ORDERS]).then(rows=>{const map=Object.fromEntries(rows);if(map[KEY_DRAFTS])setDrafts(JSON.parse(map[KEY_DRAFTS]));if(map[KEY_PROFILE])setProfile({...initialProfile,...JSON.parse(map[KEY_PROFILE])});if(map[KEY_ORDERS])setOrders(JSON.parse(map[KEY_ORDERS]));}).catch(()=>{});},[]);
 useEffect(()=>{let active=true;const load=async()=>{if(!accountEmail)return;const {data:{user}}=await supabase.auth.getUser();if(!user)return;const {data}=await supabase.from("market_orders").select("id,status,total_mwk,created_at").eq("buyer_user_id",user.id).order("created_at",{ascending:false});if(active&&data)setOrders(data);};void load();return()=>{active=false;};},[accountEmail]);
 const persistDrafts=async(next:Draft[])=>{setDrafts(next);await AsyncStorage.setItem(KEY_DRAFTS,JSON.stringify(next));};
 const persistProfile=async(next:Profile)=>{setProfile(next);await AsyncStorage.setItem(KEY_PROFILE,JSON.stringify(next));};
 const back=()=>setScreen("menu");
 const header=(name:string)=><><Pressable onPress={back} style={s.back}><Text style={s.backText}>‹  Account</Text></Pressable><Text style={s.title}>{name}</Text></>;
 const row=(icon:string,name:string,desc:string,action:()=>void)=><Pressable onPress={action} style={s.menuRow}><Text style={s.icon}>{icon}</Text><View style={{flex:1}}><Text style={s.menuTitle}>{name}</Text><Text style={s.meta}>{desc}</Text></View><Text style={s.arrow}>›</Text></Pressable>;
 return <ScrollView style={s.root} contentContainerStyle={s.content}>
 {screen==="menu"&&<><Text style={s.title}>Your account</Text><Text style={s.subtitle}>Manage your marketplace activity on this device.</Text>
  <View style={s.profileCard}><Text style={s.avatar}>👤</Text><View style={{flex:1}}><Text style={s.menuTitle}>{profile.displayName||"Guest shopper"}</Text><Text style={s.meta}>{profile.phone||"No phone number added"} · {profile.location||"Location not set"}</Text></View><Text style={s.demo}>LOCAL</Text></View>
  {row("♙",accountEmail?"Signed in":"Sign in / Register",accountEmail||"Unlock buyer and seller account features",()=>setScreen("auth"))}
  {row("▣","Seller Centre","Apply, manage listings and publish products",()=>setScreen("seller"))}
  {row("▤","Saved drafts","Previously saved drafts on this device",()=>setScreen("drafts"))}
  {row("▤","Orders","View order history and delivery status",()=>setScreen("orders"))}
  {row("♙","Profile","Edit your local profile details",()=>setScreen("profile"))}
  {row("⚙","Settings","Notifications, language and app preferences",()=>setScreen("settings"))}
  {accountEmail?<Pressable style={s.menuRow} onPress={()=>Alert.alert("Sign out?","You will need to sign in again to access account features.",[{text:"Cancel"},{text:"Sign out",style:"destructive",onPress:()=>void supabase.auth.signOut()}])}><Text style={s.menuTitle}>Sign out of {accountEmail}</Text></Pressable>:null}
  <View style={s.note}><Text style={s.noteText}>Account sign-in is connected. Seller publishing and payment-backed checkout still require seller approval and payment integration.</Text></View>
 </>}
 {screen==="auth"&&<AuthScreen onBack={back} onDone={()=>setScreen("menu")}/>}
 {screen==="seller"&&<SellerPortal/>}
 {screen==="drafts"&&<>{header("Saved local drafts")}{drafts.length?drafts.map(d=><View key={d.id} style={s.card}><Text style={s.menuTitle}>{d.title}</Text><Text style={s.price}>{money(Number(d.price)||0)} · {d.category}</Text><Text style={s.meta}>{d.description||"No description"}</Text><Pressable onPress={()=>Alert.alert("Delete draft?","Remove this saved draft from this device?",[{text:"Cancel"},{text:"Delete",style:"destructive",onPress:()=>void persistDrafts(drafts.filter(x=>x.id!==d.id))}])}><Text style={s.delete}>Delete draft</Text></Pressable></View>):<Text style={s.empty}>No saved drafts on this device.</Text>}</>}
 {screen==="orders"&&<>{header("Order history")}<View style={s.note}><Text style={s.noteText}>No real orders can be placed until sign-in and checkout are connected. This page will show confirmed purchases here.</Text></View>
  {orders.length?orders.map((o,i)=><View key={i} style={s.card}><Text style={s.menuTitle}>Order {o.id}</Text><Text style={s.meta}>{o.created_at?new Date(o.created_at).toLocaleString():o.date} · {o.status}</Text><Text style={s.price}>{money(Number(o.total_mwk??o.total??0))}</Text></View>):<View style={s.emptyCard}><Text style={s.emptyIcon}>▤</Text><Text style={s.menuTitle}>No orders yet</Text><Text style={s.meta}>Your purchases and delivery updates will appear here.</Text></View>}
 </>}
 {screen==="profile"&&<>{header("Profile")}<Text style={s.label}>Display name</Text><TextInput value={profile.displayName} onChangeText={v=>void persistProfile({...profile,displayName:v})} style={s.input} placeholder="Your name"/>
  <Text style={s.label}>Phone number</Text><TextInput value={profile.phone} onChangeText={v=>void persistProfile({...profile,phone:v})} style={s.input} keyboardType="phone-pad" placeholder="+265"/>
  <Text style={s.label}>City / District</Text><TextInput value={profile.location} onChangeText={v=>void persistProfile({...profile,location:v})} style={s.input} placeholder="Lilongwe"/>
  <View style={s.note}><Text style={s.noteText}>This profile is stored locally. It is not an authenticated marketplace account and is not shared with sellers.</Text></View>
 </>}
 {screen==="settings"&&<>{header("Settings")}<View style={s.settingRow}><View style={{flex:1}}><Text style={s.menuTitle}>Notifications</Text><Text style={s.meta}>Local preference for future alerts</Text></View><Switch value={profile.notifications} onValueChange={v=>void persistProfile({...profile,notifications:v})} trackColor={{true:"#ef7b25"}}/></View>
  <Text style={s.label}>Language</Text><View style={s.pills}>{["English","Chichewa","Tumbuka"].map(v=><Pressable key={v} onPress={()=>void persistProfile({...profile,language:v})} style={[s.pill,profile.language===v&&s.pillActive]}><Text style={[s.pillText,profile.language===v&&{color:"#fff"}]}>{v}</Text></Pressable>)}</View>
  <View style={s.note}><Text style={s.noteText}>Theme and full notification delivery settings will be connected in a later release.</Text></View>
 </>}
 </ScrollView>;
}
const s=StyleSheet.create({root:{flex:1,backgroundColor:"#f7f8fa"},content:{padding:16,paddingBottom:105},title:{fontSize:25,fontWeight:"900",color:"#172b4d",marginTop:8,marginBottom:8},subtitle:{fontSize:12,color:"#778293",marginBottom:14},back:{paddingVertical:8},backText:{color:"#ef7b25",fontWeight:"800"},profileCard:{backgroundColor:"#172b4d",borderRadius:13,padding:15,flexDirection:"row",alignItems:"center",gap:12,marginBottom:12},avatar:{fontSize:28},demo:{fontSize:9,color:"#ffc18d",fontWeight:"900"},menuRow:{backgroundColor:"#fff",borderRadius:11,padding:14,marginTop:9,flexDirection:"row",alignItems:"center",gap:12,borderWidth:1,borderColor:"#e9edf2"},icon:{fontSize:22,color:"#ef7b25",width:28,textAlign:"center"},menuTitle:{fontSize:14,fontWeight:"800",color:"#172b4d"},meta:{fontSize:10,color:"#7d8795",marginTop:4,lineHeight:15},arrow:{fontSize:23,color:"#ef7b25"},note:{backgroundColor:"#fff1e5",padding:12,borderRadius:9,marginTop:14},noteText:{fontSize:10,color:"#854d22",fontWeight:"700",lineHeight:16},label:{fontSize:11,fontWeight:"800",color:"#4e5b6e",marginTop:15,marginBottom:6},input:{backgroundColor:"#fff",borderWidth:1,borderColor:"#e2e6ec",borderRadius:9,padding:12,fontSize:13,color:"#172b4d"},primary:{backgroundColor:"#ef7b25",padding:14,borderRadius:9,alignItems:"center",marginTop:15},primaryText:{color:"#fff",fontWeight:"900",fontSize:12},section:{fontSize:16,fontWeight:"900",color:"#172b4d",marginTop:23,marginBottom:8},card:{backgroundColor:"#fff",padding:14,borderRadius:10,borderWidth:1,borderColor:"#e9edf2",marginTop:9},price:{fontSize:13,fontWeight:"900",color:"#ef7b25",marginTop:6},delete:{fontSize:11,color:"#c44",fontWeight:"800",marginTop:12},empty:{fontSize:12,color:"#7d8795",textAlign:"center",padding:24},emptyCard:{backgroundColor:"#fff",padding:25,alignItems:"center",borderRadius:12,marginTop:15},emptyIcon:{fontSize:32,color:"#a5afbd",marginBottom:8},settingRow:{backgroundColor:"#fff",padding:14,borderRadius:10,flexDirection:"row",alignItems:"center",marginTop:12},pills:{flexDirection:"row",gap:8,flexWrap:"wrap"},pill:{borderWidth:1,borderColor:"#dfe4ea",paddingVertical:9,paddingHorizontal:12,borderRadius:18,backgroundColor:"#fff"},pillActive:{backgroundColor:"#172b4d",borderColor:"#172b4d"},pillText:{fontSize:11,fontWeight:"700",color:"#536073"}});
