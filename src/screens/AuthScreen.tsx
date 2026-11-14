import React,{useEffect,useState} from "react";
import {View,Text,TextInput,Pressable,StyleSheet,Alert,ActivityIndicator} from "react-native";
import {supabase} from "../lib/supabase";

type Mode="signin"|"signup"|"recover"|"reset";
export function AuthScreen({onDone,onBack,initialMode="signin"}:{onDone:()=>void;onBack:()=>void;initialMode?:Mode}){
 const [mode,setMode]=useState<Mode>(initialMode);const [email,setEmail]=useState("");const [password,setPassword]=useState("");const [confirm,setConfirm]=useState("");const [busy,setBusy]=useState(false);
 useEffect(()=>{if(initialMode==="reset")setMode("reset");},[initialMode]);
 useEffect(()=>{const {data:{subscription}}=supabase.auth.onAuthStateChange(event=>{if(event==="PASSWORD_RECOVERY")setMode("reset");});return()=>subscription.unsubscribe();},[]);
 const submit=async()=>{
  const clean=email.trim().toLowerCase();
  if(mode!=="reset"&&!/^\S+@\S+\.\S+$/.test(clean)){Alert.alert("Check your email","Enter a valid email address.");return;}
  if(mode==="recover"){
   setBusy(true);try{const {error}=await supabase.auth.resetPasswordForEmail(clean,{redirectTo:"mw.wealthgrid.malawimarket://auth/reset-password"});if(error)throw error;Alert.alert("Recovery email sent","Open the recovery link on this device. The app redirect URL must be allowed in Supabase Auth settings.");setMode("signin");}catch(e:any){Alert.alert("Recovery failed",e?.message||"Could not send recovery email.");}finally{setBusy(false);}return;
  }
  if(password.length<8){Alert.alert("Weak password","Use at least 8 characters.");return;}
  if(mode==="reset"&&password!==confirm){Alert.alert("Passwords do not match","Enter the same new password twice.");return;}
  setBusy(true);
  try{
   if(mode==="signin"){const {error}=await supabase.auth.signInWithPassword({email:clean,password});if(error)throw error;onDone();}
   else if(mode==="signup"){const {data,error}=await supabase.auth.signUp({email:clean,password});if(error)throw error;if(data.session)onDone();else Alert.alert("Check your email","Your account was created. Confirm your email, then sign in.");}
   else{const {error}=await supabase.auth.updateUser({password});if(error)throw error;Alert.alert("Password updated","Your password has been changed.");onDone();}
  }catch(e:any){Alert.alert("Account error",e?.message||"Could not complete account request.");}
  finally{setBusy(false);}
 };
 const heading=mode==="signin"?"Welcome back":mode==="signup"?"Create your account":mode==="recover"?"Reset your password":"Choose a new password";
 return <View style={s.wrap}>
  <Pressable onPress={onBack}><Text style={s.back}>‹  Account</Text></Pressable>
  <Text style={s.title}>{heading}</Text>
  <Text style={s.sub}>Use your Malawi Market account to shop, sell and manage your marketplace activity.</Text>
  {mode!=="reset"?<><Text style={s.label}>Email address</Text><TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" style={s.input} placeholder="you@example.com"/></>:null}
  {mode!=="recover"?<><Text style={s.label}>{mode==="reset"?"New password":"Password"}</Text><TextInput value={password} onChangeText={setPassword} secureTextEntry autoComplete={mode==="signin"?"password":"new-password"} style={s.input} placeholder="At least 8 characters"/>{mode==="reset"?<><Text style={s.label}>Confirm new password</Text><TextInput value={confirm} onChangeText={setConfirm} secureTextEntry style={s.input} placeholder="Enter password again"/></>:null}</>:null}
  <Pressable disabled={busy} onPress={()=>void submit()} style={s.primary}>{busy?<ActivityIndicator color="#fff"/>:<Text style={s.primaryText}>{mode==="signin"?"Sign in":mode==="signup"?"Create account":mode==="recover"?"Send recovery email":"Update password"}</Text>}</Pressable>
  {mode==="signin"?<><Pressable onPress={()=>setMode("recover")} style={s.switch}><Text style={s.switchText}>Forgot password?</Text></Pressable><Pressable onPress={()=>setMode("signup")} style={s.switch}><Text style={s.switchText}>New to Malawi Market? Create an account</Text></Pressable></>:null}
  {mode!=="signin"?<Pressable onPress={()=>setMode("signin")} style={s.switch}><Text style={s.switchText}>Back to sign in</Text></Pressable>:null}
  <Text style={s.foot}>Password recovery requires the Malawi Market app redirect URL to be allowed in Supabase Auth settings.</Text>
 </View>;
}
const s=StyleSheet.create({wrap:{flex:1,backgroundColor:"#f4f6f9",padding:20},back:{color:"#ef7b25",fontWeight:"800",paddingVertical:8},title:{fontSize:28,fontWeight:"900",color:"#172b4d",marginTop:20,letterSpacing:-.5},sub:{fontSize:12,color:"#788293",lineHeight:18,marginTop:7,marginBottom:14},label:{fontSize:11,fontWeight:"800",color:"#4e5b6e",marginTop:14,marginBottom:6},input:{backgroundColor:"#fff",borderWidth:1,borderColor:"#e4e9f0",borderRadius:12,padding:15,color:"#172b4d"},primary:{backgroundColor:"#ef7628",padding:15,borderRadius:12,alignItems:"center",marginTop:20,minHeight:46,justifyContent:"center"},primaryText:{color:"#fff",fontWeight:"900"},switch:{padding:11,alignItems:"center"},switchText:{color:"#172b4d",fontWeight:"800",fontSize:12},foot:{fontSize:10,color:"#818b99",lineHeight:15,marginTop:16}});
