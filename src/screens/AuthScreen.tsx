import React,{useEffect,useRef,useState} from "react";
import {View,Text,TextInput,Pressable,StyleSheet,Alert,ActivityIndicator} from "react-native";
import * as WebBrowser from "expo-web-browser";
import {supabase} from "../lib/supabase";

type Mode="signin"|"signup"|"recover"|"reset";
const GOOGLE_REDIRECT_URL="mw.wealthgrid.malawimarket://auth/callback";

export function AuthScreen({onDone,onBack,initialMode="signin"}:{onDone:()=>void;onBack:()=>void;initialMode?:Mode}){
 const [mode,setMode]=useState<Mode>(initialMode);const [email,setEmail]=useState("");const [password,setPassword]=useState("");const [confirm,setConfirm]=useState("");const [busy,setBusy]=useState(false);const submitLock=useRef(false);
 useEffect(()=>{if(initialMode==="reset")setMode("reset");},[initialMode]);
 useEffect(()=>{const {data:{subscription}}=supabase.auth.onAuthStateChange(event=>{if(event==="PASSWORD_RECOVERY")setMode("reset");});return()=>subscription.unsubscribe();},[]);
 const signInWithGoogle=async()=>{
  if(submitLock.current)return;
  submitLock.current=true;setBusy(true);
  try{
   const {data,error}=await supabase.auth.signInWithOAuth({
    provider:"google",
    options:{redirectTo:GOOGLE_REDIRECT_URL,skipBrowserRedirect:true,queryParams:{prompt:"select_account"}}
   });
   if(error)throw error;
   if(!data.url)throw new Error("Supabase did not return a Google sign-in URL.");
   const result=await WebBrowser.openAuthSessionAsync(data.url,GOOGLE_REDIRECT_URL);
   if(result.type!=="success")return;
   const callbackUrl=new URL(result.url);
   const callbackParams=new URLSearchParams(callbackUrl.search);
   const hashParams=new URLSearchParams(callbackUrl.hash.replace(/^#/,""));
   const callbackError=callbackParams.get("error_description")||hashParams.get("error_description")||callbackParams.get("error")||hashParams.get("error");
   if(callbackError)throw new Error(callbackError.replace(/\+/g," "));
   const code=callbackParams.get("code");
   if(!code)throw new Error("Google returned without an authorization code. Close the browser and try again.");
   const {error:exchangeError}=await supabase.auth.exchangeCodeForSession(code);
   if(exchangeError)throw exchangeError;
   onDone();
  }catch(e:any){
   Alert.alert("Google sign-in failed",e?.message||"Could not complete Google sign-in. Try again.");
  }finally{setBusy(false);submitLock.current=false;}
 };
 const submit=async()=>{
  if(submitLock.current)return;
  const clean=email.trim().toLowerCase();
  if(mode!=="reset"&&!/^\\S+@\\S+\\.\\S+$/.test(clean)){Alert.alert("Check your email","Enter a valid email address.");return;}
  if(mode==="recover"){
   submitLock.current=true;setBusy(true);try{const {error}=await supabase.auth.resetPasswordForEmail(clean,{redirectTo:"mw.wealthgrid.malawimarket://auth/reset-password"});if(error)throw error;Alert.alert("Recovery email sent","Open the recovery link on this device. The app redirect URL must be allowed in Supabase Auth settings.");setMode("signin");}catch(e:any){Alert.alert("Recovery failed",e?.message||"Could not send recovery email.");}finally{setBusy(false);submitLock.current=false;}return;
  }
  if(password.length<8){Alert.alert("Weak password","Use at least 8 characters.");return;}
  if(mode==="reset"&&password!==confirm){Alert.alert("Passwords do not match","Enter the same new password twice.");return;}
  submitLock.current=true;setBusy(true);
  try{
   if(mode==="signin"){const {error}=await supabase.auth.signInWithPassword({email:clean,password});if(error)throw error;onDone();}
   else if(mode==="signup"){const {data,error}=await supabase.auth.signUp({email:clean,password});if(error)throw error;if(data.session)onDone();else Alert.alert("Check your email","Your account was created. Confirm your email, then sign in.");}
   else{const {error}=await supabase.auth.updateUser({password});if(error)throw error;Alert.alert("Password updated","Your password has been changed.");onDone();}
  }catch(e:any){Alert.alert("Account error",e?.message||"Could not complete account request.");}
  finally{setBusy(false);submitLock.current=false;}
 };
 const heading=mode==="signin"?"Welcome back":mode==="signup"?"Create your account":mode==="recover"?"Reset your password":"Choose a new password";
 return <View style={s.wrap}>
  <Pressable onPress={onBack}><Text style={s.back}>‹  Account</Text></Pressable>
  <Text style={s.title}>{heading}</Text>
  <Text style={s.sub}>Use your Malawi Market account to shop, sell and manage your marketplace activity.</Text>
  {mode==="signin"||mode==="signup"?<>
   <Pressable disabled={busy} onPress={()=>void signInWithGoogle()} style={[s.googleButton,busy&&{opacity:.6}]}>
    {busy?<ActivityIndicator color="#202124"/>:<><Text style={s.googleMark}>G</Text><Text style={s.googleText}>Continue with Google</Text></>}
   </Pressable>
   <View style={s.dividerRow}><View style={s.divider}/><Text style={s.dividerText}>OR CONTINUE WITH EMAIL</Text><View style={s.divider}/></View>
  </>:null}
  {mode!=="reset"?<><Text style={s.label}>Email address</Text><TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" style={s.input} placeholder="you@example.com"/></>:null}
  {mode!=="recover"?<><Text style={s.label}>{mode==="reset"?"New password":"Password"}</Text><TextInput value={password} onChangeText={setPassword} secureTextEntry autoComplete={mode==="signin"?"password":"new-password"} style={s.input} placeholder="At least 8 characters"/>{mode==="reset"?<><Text style={s.label}>Confirm new password</Text><TextInput value={confirm} onChangeText={setConfirm} secureTextEntry style={s.input} placeholder="Enter password again"/></>:null}</>:null}
  <Pressable disabled={busy} onPress={()=>void submit()} style={[s.primary,busy&&{opacity:.6}]}>{busy?<ActivityIndicator color="#fff"/>:<Text style={s.primaryText}>{mode==="signin"?"Sign in":mode==="signup"?"Create account":mode==="recover"?"Send recovery email":"Update password"}</Text>}</Pressable>
  {mode==="signin"?<><Pressable onPress={()=>setMode("recover")} style={s.switch}><Text style={s.switchText}>Forgot password?</Text></Pressable><Pressable onPress={()=>setMode("signup")} style={s.switch}><Text style={s.switchText}>New to Malawi Market? Create an account</Text></Pressable></>:null}
  {mode!=="signin"?<Pressable onPress={()=>setMode("signin")} style={s.switch}><Text style={s.switchText}>Back to sign in</Text></Pressable>:null}
  <Text style={s.foot}>Password recovery requires the Malawi Market app redirect URL to be allowed in Supabase Auth settings.</Text>
 </View>;
}
const s=StyleSheet.create({wrap:{flex:1,backgroundColor:"#ffffff",padding:20},back:{color:"#ef7b25",fontWeight:"800",paddingVertical:8},title:{fontSize:27,fontWeight:"700",color:"#202124",marginTop:20,letterSpacing:-.6},sub:{fontSize:12,color:"#4b5563",lineHeight:18,marginTop:7,marginBottom:14},label:{fontSize:11,fontWeight:"800",color:"#414b59",marginTop:14,marginBottom:6},input:{backgroundColor:"#f1f2f4",borderWidth:1,borderColor:"#d9dde3",borderRadius:12,padding:15,color:"#202124"},googleButton:{height:50,borderRadius:12,borderWidth:1,borderColor:"#d9dde3",backgroundColor:"#fff",flexDirection:"row",alignItems:"center",justifyContent:"center",gap:11,marginTop:12},googleMark:{fontSize:19,fontWeight:"900",color:"#4285f4"},googleText:{fontSize:13,fontWeight:"800",color:"#202124"},dividerRow:{flexDirection:"row",alignItems:"center",gap:10,marginTop:18,marginBottom:2},divider:{flex:1,height:1,backgroundColor:"#e2e4e8"},dividerText:{fontSize:9,fontWeight:"800",color:"#858b94",letterSpacing:.5},primary:{backgroundColor:"#ef7628",padding:15,borderRadius:12,alignItems:"center",marginTop:20,minHeight:48,justifyContent:"center"},primaryText:{color:"#fff",fontWeight:"900"},switch:{padding:11,alignItems:"center"},switchText:{color:"#252a31",fontWeight:"800",fontSize:12},foot:{fontSize:10,color:"#4b5563",lineHeight:15,marginTop:16}});
