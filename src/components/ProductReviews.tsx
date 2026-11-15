import React, { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, Alert, ActivityIndicator } from "react-native";
import { supabase } from "../lib/supabase";
type Review={id:string;rating:number;body:string;created_at:string};
export function ProductReviews({productId}:{productId:string}){
 const [rows,setRows]=useState<Review[]>([]);
 const [rating,setRating]=useState(5); const [comment,setComment]=useState("");
 const [loading,setLoading]=useState(true); const [saving,setSaving]=useState(false);
 const load=async()=>{setLoading(true);const {data,error}=await supabase.from("market_product_reviews").select("id,rating,body,created_at").eq("product_id",productId).order("created_at",{ascending:false}).limit(30);if(error){setRows([]);}else setRows((data??[]) as Review[]);setLoading(false);};
 useEffect(()=>{void load();},[productId]);
 const average=rows.length?rows.reduce((a,b)=>a+b.rating,0)/rows.length:0;
 const submit=async()=>{
  if(comment.trim().length<2){Alert.alert("Write a review","Add at least two characters.");return;}
  setSaving(true);
  try{
   const {data:{user},error:userError}=await supabase.auth.getUser();
   if(userError) throw userError;
   if(!user){Alert.alert("Sign in required","Sign in from Account before submitting a public review.");return;}
   const {error}=await supabase.from("market_product_reviews").upsert({product_id:productId,reviewer_user_id:user.id,rating,body:comment.trim()},{onConflict:"product_id,reviewer_user_id"});
   if(error) throw error;
   setComment(""); await load(); Alert.alert("Review published","Your review is now available to other shoppers.");
  }catch(e:any){Alert.alert("Could not submit review",e?.message||"Please try again.");}
  finally{setSaving(false);}
 };
 return <View style={s.wrap}>
  <Text style={s.heading}>Product reviews</Text>
  <Text style={s.summary}>{rows.length?average.toFixed(1)+" / 5 · "+rows.length+" review(s)": "No reviews yet"}</Text>
  {loading?<ActivityIndicator color="#ef7b25" style={{margin:12}}/>:rows.map(r=><View key={r.id} style={s.review}><Text style={s.stars}>{"★".repeat(r.rating)}{"☆".repeat(5-r.rating)}</Text><Text style={s.comment}>{r.body}</Text><Text style={s.date}>{new Date(r.created_at).toLocaleDateString()}</Text></View>)}
  <Text style={s.label}>Your rating</Text><View style={s.rating}>{[1,2,3,4,5].map(n=><Pressable key={n} onPress={()=>setRating(n)}><Text style={[s.star,rating>=n&&s.selected]}>★</Text></Pressable>)}</View>
  <TextInput value={comment} onChangeText={setComment} placeholder="Share your experience" multiline style={s.input}/>
  <Pressable disabled={saving} style={s.button} onPress={()=>void submit()}>{saving?<ActivityIndicator color="#fff"/>:<Text style={s.buttonText}>Publish review</Text>}</Pressable>
  <Text style={s.foot}>Reviews are linked to your signed-in account. You can submit one review per product and update it later by submitting again.</Text>
 </View>;
}
const s=StyleSheet.create({wrap:{marginTop:26,paddingTop:20,borderTopWidth:1,borderColor:"#d9dde3"},heading:{fontSize:19,fontWeight:"900",color:"#252a31"},summary:{fontSize:11,color:"#4b5563",marginTop:5},review:{backgroundColor:"#f7f8fa",padding:14,borderRadius:14,marginTop:11},stars:{color:"#ef8a25",fontSize:13},comment:{fontSize:12,color:"#39465a",marginTop:5,lineHeight:18},date:{fontSize:9,color:"#8a93a0",marginTop:6},label:{fontSize:11,fontWeight:"800",color:"#414b59",marginTop:17},rating:{flexDirection:"row",gap:8,marginTop:6},star:{fontSize:28,color:"#c8ced6"},selected:{color:"#ef8a25"},input:{backgroundColor:"#fff",borderWidth:1,borderColor:"#e1e5eb",borderRadius:13,padding:14,minHeight:82,textAlignVertical:"top",fontSize:13,marginTop:10},button:{backgroundColor:"#f36f21",padding:14,borderRadius:12,alignItems:"center",marginTop:10},buttonText:{color:"#fff",fontWeight:"800",fontSize:11},foot:{fontSize:9,color:"#8b94a2",lineHeight:14,marginTop:8}});
