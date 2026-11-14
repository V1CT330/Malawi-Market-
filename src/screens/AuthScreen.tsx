import React, { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, Alert, ActivityIndicator } from "react-native";
import { supabase } from "../lib/supabase";

export function AuthScreen({ onDone, onBack }: { onDone: () => void; onBack: () => void }) {
  const [mode,setMode]=useState<"signin"|"signup">("signin");
  const [email,setEmail]=useState(""); const [password,setPassword]=useState("");
  const [busy,setBusy]=useState(false);
  const submit=async()=>{
    const clean=email.trim().toLowerCase();
    if(!/^\S+@\S+\.\S+$/.test(clean)||password.length<8){Alert.alert("Check your details","Enter a valid email and a password with at least 8 characters.");return;}
    setBusy(true);
    try {
      if(mode==="signin"){
        const {error}=await supabase.auth.signInWithPassword({email:clean,password});
        if(error) throw error;
        onDone();
      } else {
        const {data,error}=await supabase.auth.signUp({email:clean,password});
        if(error) throw error;
        if(data.session) onDone();
        else Alert.alert("Check your email","Your account was created. Confirm your email, then sign in.");
      }
    } catch(e:any) { Alert.alert("Account error",e?.message||"Could not complete account request."); }
    finally { setBusy(false); }
  };
  return <View style={s.wrap}>
    <Pressable onPress={onBack}><Text style={s.back}>‹  Account</Text></Pressable>
    <Text style={s.title}>{mode==="signin"?"Welcome back":"Create your account"}</Text>
    <Text style={s.sub}>Use your email to access Malawi Market buyer and seller features.</Text>
    <Text style={s.label}>Email address</Text>
    <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" style={s.input} placeholder="you@example.com"/>
    <Text style={s.label}>Password</Text>
    <TextInput value={password} onChangeText={setPassword} secureTextEntry autoComplete={mode==="signin"?"password":"new-password"} style={s.input} placeholder="At least 8 characters"/>
    <Pressable disabled={busy} onPress={()=>void submit()} style={s.primary}>{busy?<ActivityIndicator color="#fff"/>:<Text style={s.primaryText}>{mode==="signin"?"Sign in":"Create account"}</Text>}</Pressable>
    <Pressable onPress={()=>setMode(mode==="signin"?"signup":"signin")} style={s.switch}><Text style={s.switchText}>{mode==="signin"?"New to Malawi Market? Create an account":"Already registered? Sign in"}</Text></Pressable>
    <Text style={s.foot}>Email confirmation may be required depending on the project's Supabase Auth settings. Password recovery and phone OTP are not configured in this release.</Text>
  </View>;
}
const s=StyleSheet.create({wrap:{flex:1,backgroundColor:"#f7f8fa",padding:18},back:{color:"#ef7b25",fontWeight:"800",paddingVertical:8},title:{fontSize:25,fontWeight:"900",color:"#172b4d",marginTop:18},sub:{fontSize:12,color:"#788293",lineHeight:18,marginTop:7,marginBottom:14},label:{fontSize:11,fontWeight:"800",color:"#4e5b6e",marginTop:14,marginBottom:6},input:{backgroundColor:"#fff",borderWidth:1,borderColor:"#e2e6ec",borderRadius:9,padding:13,color:"#172b4d"},primary:{backgroundColor:"#ef7b25",padding:14,borderRadius:9,alignItems:"center",marginTop:20,minHeight:46,justifyContent:"center"},primaryText:{color:"#fff",fontWeight:"900"},switch:{padding:15,alignItems:"center"},switchText:{color:"#172b4d",fontWeight:"800",fontSize:12},foot:{fontSize:10,color:"#818b99",lineHeight:15,marginTop:16}});
