import React, { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { View, Text, TextInput, Pressable, StyleSheet, Alert } from "react-native";
type Review={id:string;rating:number;comment:string;createdAt:string};
const key="@malawi-market/product-reviews";
export function ProductReviews({productId}:{productId:string}){
 const [all,setAll]=useState<Record<string,Review[]>>({});
 const [rating,setRating]=useState(5); const [comment,setComment]=useState("");
 useEffect(()=>{AsyncStorage.getItem(key).then(v=>{if(v)setAll(JSON.parse(v));}).catch(()=>{});},[]);
 const rows=all[productId]||[];
 const average=rows.length?rows.reduce((a,b)=>a+b.rating,0)/rows.length:0;
 const save=async(next:Record<string,Review[]>)=>{setAll(next);await AsyncStorage.setItem(key,JSON.stringify(next));};
 return <View style={s.wrap}>
  <Text style={s.heading}>Product reviews</Text>
  <Text style={s.summary}>{rows.length?average.toFixed(1)+" / 5 · "+rows.length+" local review(s)":"No reviews yet"}</Text>
  {rows.map(r=><View key={r.id} style={s.review}><Text style={s.stars}>{"★".repeat(r.rating)}{"☆".repeat(5-r.rating)}</Text><Text style={s.comment}>{r.comment}</Text><Text style={s.date}>Saved on this device · {new Date(r.createdAt).toLocaleDateString()}</Text></View>)}
  <Text style={s.label}>Your rating</Text><View style={s.rating}>{[1,2,3,4,5].map(n=><Pressable key={n} onPress={()=>setRating(n)}><Text style={[s.star,rating>=n&&s.selected]}>★</Text></Pressable>)}</View>
  <TextInput value={comment} onChangeText={setComment} placeholder="Share your experience (local demo review)" multiline style={s.input}/>
  <Pressable style={s.button} onPress={()=>{if(!comment.trim()){Alert.alert("Write a review","Add a short comment before saving.");return;}const next={...all,[productId]:[{id:"review-"+Date.now(),rating,comment:comment.trim(),createdAt:new Date().toISOString()},...rows]};void save(next);setComment("");Alert.alert("Review saved","This review is stored locally and is not public.");}}><Text style={s.buttonText}>Save local review</Text></Pressable>
  <Text style={s.foot}>Local preview only. Reviews are not submitted to sellers or shown to other users.</Text>
 </View>;
}
const s=StyleSheet.create({wrap:{marginTop:24,paddingTop:18,borderTopWidth:1,borderColor:"#eceef1"},heading:{fontSize:18,fontWeight:"900",color:"#172b4d"},summary:{fontSize:11,color:"#778293",marginTop:5},review:{backgroundColor:"#f7f8fa",padding:12,borderRadius:9,marginTop:10},stars:{color:"#ef8a25",fontSize:13},comment:{fontSize:12,color:"#39465a",marginTop:5,lineHeight:18},date:{fontSize:9,color:"#8a93a0",marginTop:6},label:{fontSize:11,fontWeight:"800",color:"#4d596b",marginTop:17},rating:{flexDirection:"row",gap:8,marginTop:6},star:{fontSize:28,color:"#c8ced6"},selected:{color:"#ef8a25"},input:{backgroundColor:"#fff",borderWidth:1,borderColor:"#e1e5eb",borderRadius:9,padding:11,minHeight:70,textAlignVertical:"top",fontSize:12,marginTop:9},button:{backgroundColor:"#172b4d",padding:12,borderRadius:9,alignItems:"center",marginTop:9},buttonText:{color:"#fff",fontWeight:"800",fontSize:11},foot:{fontSize:9,color:"#8b94a2",lineHeight:14,marginTop:8}});
