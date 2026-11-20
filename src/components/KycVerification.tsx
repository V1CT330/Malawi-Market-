import React,{useCallback,useEffect,useState} from "react";
import {ActivityIndicator,Alert,Image,Linking,Pressable,ScrollView,StyleSheet,Text,TextInput,View} from "react-native";
import * as ImagePicker from "expo-image-picker";
import {supabase} from "../lib/supabase";

type KycStatus="none"|"pending"|"approved"|"rejected";
type Picked={uri:string;mimeType:string;fileSize?:number};
type Submission={id:string;user_id:string;full_name:string;id_type:string;id_number:string;document_url:string|null;selfie_url:string|null;status:KycStatus;notes:string|null;created_at:string;documentSignedUrl?:string|null;selfieSignedUrl?:string|null};

const idTypes=["National ID","Passport","Driving Licence"];
const mime=(asset:ImagePicker.ImagePickerAsset)=>asset.mimeType??"image/jpeg";
const ext=(type:string)=>type==="image/png"?"png":type==="image/webp"?"webp":"jpg";

export function SellerKycVerification({onStatusChange}:{onStatusChange?:(status:KycStatus)=>void}){
 const [submission,setSubmission]=useState<Submission|null>(null);
 const [loading,setLoading]=useState(true);const [busy,setBusy]=useState(false);
 const [fullName,setFullName]=useState("");const [idType,setIdType]=useState(idTypes[0]);const [idNumber,setIdNumber]=useState("");
 const [document,setDocument]=useState<Picked|null>(null);const [selfie,setSelfie]=useState<Picked|null>(null);
 const load=useCallback(async()=>{
  setLoading(true);
  try{
   const {data:{user},error:userError}=await supabase.auth.getUser();if(userError)throw userError;
   if(!user){setSubmission(null);onStatusChange?.("none");return;}
   const {data,error}=await supabase.from("kyc_submissions").select("id,user_id,full_name,id_type,id_number,document_url,selfie_url,status,notes,created_at").eq("user_id",user.id).order("created_at",{ascending:false}).limit(1).maybeSingle();
   if(error)throw error;
   const record=(data??null) as Submission|null;setSubmission(record);onStatusChange?.(record?.status??"none");
   if(record){setFullName(record.full_name);setIdType(record.id_type);setIdNumber(record.id_number);}
  }catch(e:any){Alert.alert("Identity verification",e?.message||"Could not load your verification status.");}
  finally{setLoading(false);}
 },[onStatusChange]);
 useEffect(()=>{void load();},[load]);
 const choose=async(kind:"document"|"selfie")=>{
  try{
   let result:ImagePicker.ImagePickerResult;
   if(kind==="document"){
    result=await ImagePicker.launchImageLibraryAsync({mediaTypes:["images"],allowsEditing:true,quality:.85});
   }else{
    const permission=await ImagePicker.requestCameraPermissionsAsync();
    if(!permission.granted){
     Alert.alert(
      "Camera access needed",
      permission.canAskAgain
       ?"Allow camera access to take the identity-verification selfie. You can continue browsing without it."
       :"Camera access is blocked. Open Android Settings, allow Camera for Malawi Market, then try again.",
      permission.canAskAgain
       ?[{text:"Not now",style:"cancel"}]
       :[{text:"Not now",style:"cancel"},{text:"Open settings",onPress:()=>void Linking.openSettings()}]
     );
     return;
    }
    result=await ImagePicker.launchCameraAsync({mediaTypes:["images"],allowsEditing:true,quality:.85});
   }
   if(result.canceled)return;const asset=result.assets[0];if(!asset)return;
  if(asset.fileSize&&asset.fileSize>5*1024*1024){Alert.alert("File too large","Choose an image under 5 MB.");return;}
  if(!["image/jpeg","image/png","image/webp"].includes(mime(asset))){Alert.alert("Unsupported file","Use a JPEG, PNG or WebP image.");return;}
  const picked={uri:asset.uri,mimeType:mime(asset),fileSize:asset.fileSize};
  if(kind==="document")setDocument(picked);else setSelfie(picked);
  }catch(error:any){
   Alert.alert("Unable to open camera or photos",error?.message||"Check the relevant permission in Android Settings and try again.");
  }
 };
 const submit=async()=>{
  if(busy)return;
  if(fullName.trim().length<3||idNumber.trim().length<4||!document||!selfie){Alert.alert("Complete your verification","Enter your legal name and ID number, then add a clear ID photo and a selfie.");return;}
  setBusy(true);const uploaded:string[]=[];
  try{
   const {data:{user},error:userError}=await supabase.auth.getUser();if(userError)throw userError;if(!user)throw new Error("Sign in again to continue.");
   const upload=async(file:Picked,kind:string)=>{
    const response=await fetch(file.uri);if(!response.ok)throw new Error("Could not read the selected image.");
    const bytes=await response.arrayBuffer();const path=user.id+"/"+kind+"-"+Date.now()+"-"+Math.random().toString(36).slice(2,8)+"."+ext(file.mimeType);
    const {error}=await supabase.storage.from("kyc-docs").upload(path,bytes,{contentType:file.mimeType,upsert:false,cacheControl:"3600"});
    if(error)throw error;uploaded.push(path);return path;
   };
   const documentPath=await upload(document,"identity");
   const selfiePath=await upload(selfie,"selfie");
   const {error}=await supabase.from("kyc_submissions").insert({user_id:user.id,full_name:fullName.trim(),id_type:idType,id_number:idNumber.trim(),document_url:documentPath,selfie_url:selfiePath});
   if(error)throw error;
   setDocument(null);setSelfie(null);Alert.alert("Submitted","Your identity documents are securely submitted for manual review.");await load();
  }catch(e:any){if(uploaded.length)await supabase.storage.from("kyc-docs").remove(uploaded);Alert.alert("Submission failed",e?.message||"Please try again.");}
  finally{setBusy(false);}
 };
 if(loading)return <View style={k.card}><ActivityIndicator color="#ef7628"/><Text style={k.meta}>Checking identity verification…</Text></View>;
 const status=submission?.status??"none";
 return <View style={k.card}>
  <Text style={k.heading}>Identity verification</Text>
  <Text style={k.meta}>Malawi Market requires identity verification before a seller account can be approved and products can be published. Your documents are stored privately and visible only to you and authorised administrators.</Text>
  {status!=="none"?<View style={k.statusBox}><Text style={k.statusTitle}>Status: {status.replace("_"," ").toUpperCase()}</Text>{submission?.notes?<Text style={k.meta}>Admin note: {submission.notes}</Text>:null}{submission?.created_at?<Text style={k.meta}>Submitted {new Date(submission.created_at).toLocaleDateString()}</Text>:null}</View>:null}
  {status==="approved"?<Text style={k.success}>Your identity is approved. You can submit a seller application or continue using Seller Centre.</Text>:null}
  {status==="pending"?<Text style={k.notice}>Your documents are waiting for administrator review. You cannot submit another application while this review is pending.</Text>:null}
  {status!=="approved"&&status!=="pending"?<>
   {status==="rejected"?<Text style={k.notice}>Your previous submission was rejected. Review the administrator note and submit corrected documents.</Text>:null}
   <Text style={k.label}>Full legal name</Text><TextInput value={fullName} onChangeText={setFullName} style={k.input} placeholder="Name as printed on your ID" autoCapitalize="words"/>
   <Text style={k.label}>Identity document</Text><View style={k.types}>{idTypes.map(value=><Pressable key={value} onPress={()=>setIdType(value)} style={[k.type,idType===value&&k.typeActive]}><Text style={[k.typeText,idType===value&&{color:"#fff"}]}>{value}</Text></Pressable>)}</View>
   <Text style={k.label}>Document number</Text><TextInput value={idNumber} onChangeText={setIdNumber} style={k.input} placeholder="Enter the number shown on your ID" autoCapitalize="characters"/>
   <Pressable disabled={busy} onPress={()=>void choose("document")} style={k.upload}><Text style={k.uploadText}>{document?"Replace ID photo":"Choose ID photo"}</Text></Pressable>{document?<Image source={{uri:document.uri}} style={k.preview}/>:null}
   <Pressable disabled={busy} onPress={()=>void choose("selfie")} style={k.upload}><Text style={k.uploadText}>{selfie?"Retake selfie":"Take a live selfie"}</Text></Pressable>{selfie?<Image source={{uri:selfie.uri}} style={k.preview}/>:null}
   <Text style={k.meta}>Use a clear, uncropped image. Maximum 5 MB per image. The selfie is a photo for manual review; this version does not perform automated liveness detection.</Text>
   <Pressable disabled={busy} onPress={()=>void submit()} style={[k.submit,busy&&{opacity:.65}]}>{busy?<ActivityIndicator color="#fff"/>:<Text style={k.submitText}>Submit identity verification</Text>}</Pressable>
  </>:null}
 </View>;
}

export function AdminKycReview(){
 const [items,setItems]=useState<Submission[]>([]);const [loading,setLoading]=useState(true);const [busyId,setBusyId]=useState<string|null>(null);const [notes,setNotes]=useState<Record<string,string>>({});
 const load=useCallback(async()=>{
  setLoading(true);
  try{
   const {data,error}=await supabase.from("kyc_submissions").select("id,user_id,full_name,id_type,id_number,document_url,selfie_url,status,notes,created_at").order("created_at",{ascending:false}).limit(100);
   if(error)throw error;
   const enriched=await Promise.all((data??[]).map(async(row:any)=>{
    const [doc,selfie]=await Promise.all([
     row.document_url?supabase.storage.from("kyc-docs").createSignedUrl(row.document_url,300):Promise.resolve({data:null,error:null}),
     row.selfie_url?supabase.storage.from("kyc-docs").createSignedUrl(row.selfie_url,300):Promise.resolve({data:null,error:null})
    ]);
    return {...row,documentSignedUrl:doc.data?.signedUrl??null,selfieSignedUrl:selfie.data?.signedUrl??null};
   }));
   setItems(enriched as Submission[]);
  }catch(e:any){Alert.alert("KYC review",e?.message||"Could not load submissions.");}
  finally{setLoading(false);}
 },[]);
 useEffect(()=>{void load();},[load]);
 const review=async(item:Submission,status:"approved"|"rejected")=>{
  if(busyId)return;const note=(notes[item.id]??"").trim();
  if(status==="rejected"&&note.length<5){Alert.alert("Reason required","Add a clear rejection reason of at least five characters.");return;}
  setBusyId(item.id);
  try{
   const {data:{user},error:userError}=await supabase.auth.getUser();if(userError)throw userError;if(!user)throw new Error("Admin session expired.");
   const {error}=await supabase.from("kyc_submissions").update({status,notes:note||null,updated_at:new Date().toISOString()}).eq("id",item.id);
   if(error)throw error;await load();
  }catch(e:any){Alert.alert("Review failed",e?.message||"Could not update verification.");}
  finally{setBusyId(null);}
 };
 if(loading)return <View style={k.card}><ActivityIndicator color="#ef7628"/><Text style={k.meta}>Loading KYC submissions…</Text></View>;
 return <View style={k.reviewWrap}>
  <View style={k.reviewHead}><View style={{flex:1}}><Text style={k.heading}>Identity verification queue</Text><Text style={k.meta}>Review identity documents before approving seller applications.</Text></View><Pressable onPress={()=>void load()} style={k.refresh}><Text style={k.uploadText}>Refresh</Text></Pressable></View>
  {!items.length?<Text style={k.meta}>No identity verification submissions yet.</Text>:null}
  {items.map(item=><View key={item.id} style={k.card}>
   <Text style={k.heading}>{item.full_name}</Text><Text style={k.meta}>{item.id_type} · ID {item.id_number} · {item.status.toUpperCase()}</Text><Text style={k.meta}>Submitted {new Date(item.created_at).toLocaleString()} · User {item.user_id.slice(0,8)}</Text>
   <View style={k.images}>{item.documentSignedUrl?<View style={k.imageCell}><Text style={k.label}>ID document</Text><Image source={{uri:item.documentSignedUrl}} style={k.reviewImage}/></View>:<Text style={k.meta}>ID image unavailable</Text>}{item.selfieSignedUrl?<View style={k.imageCell}><Text style={k.label}>Selfie</Text><Image source={{uri:item.selfieSignedUrl}} style={k.reviewImage}/></View>:<Text style={k.meta}>Selfie unavailable</Text>}</View>
   <TextInput value={notes[item.id]??item.notes??""} onChangeText={value=>setNotes(prev=>({...prev,[item.id]:value}))} style={[k.input,{minHeight:70,textAlignVertical:"top"}]} placeholder="Admin note (required when rejecting)" multiline/>
   {item.status==="pending"?<View style={k.actions}><Pressable disabled={busyId===item.id} onPress={()=>void review(item,"approved")} style={k.approve}><Text style={k.submitText}>{busyId===item.id?"Saving…":"Approve identity"}</Text></Pressable><Pressable disabled={busyId===item.id} onPress={()=>void review(item,"rejected")} style={k.reject}><Text style={k.rejectText}>Reject</Text></Pressable></View>:null}
  </View>)}
 </View>;
}

const k=StyleSheet.create({
 card:{backgroundColor:"#fff",padding:15,borderRadius:14,borderWidth:1,borderColor:"#d9dde3",marginTop:12,gap:7},
 heading:{fontSize:16,fontWeight:"900",color:"#252a31"},meta:{fontSize:11,color:"#4b5563",lineHeight:17},label:{fontSize:11,fontWeight:"800",color:"#414b59",marginTop:8,marginBottom:5},
 input:{backgroundColor:"#fff",borderWidth:1,borderColor:"#cbd1d9",borderRadius:10,padding:12,fontSize:13,color:"#252a31"},
 types:{flexDirection:"row",flexWrap:"wrap",gap:7},type:{paddingHorizontal:11,paddingVertical:9,borderRadius:18,borderWidth:1,borderColor:"#cbd1d9"},typeActive:{backgroundColor:"#f36f21",borderColor:"#f36f21"},typeText:{fontSize:10,fontWeight:"800",color:"#414b59"},
 upload:{padding:12,borderRadius:10,backgroundColor:"#202124",alignItems:"center",marginTop:8},uploadText:{fontSize:11,fontWeight:"900",color:"#ffffff"},
 preview:{width:"100%",height:150,resizeMode:"contain",backgroundColor:"#eef0f3",borderRadius:9},
 submit:{backgroundColor:"#ef7628",padding:14,borderRadius:10,alignItems:"center",marginTop:8},submitText:{fontSize:12,fontWeight:"900",color:"#fff"},
 statusBox:{backgroundColor:"#eef0f3",padding:11,borderRadius:9,marginTop:9},statusTitle:{fontSize:11,fontWeight:"900",color:"#252a31"},success:{fontSize:12,color:"#16734a",fontWeight:"800",marginTop:8},notice:{fontSize:11,color:"#85501f",backgroundColor:"#fff4e8",padding:10,borderRadius:9,marginTop:8,lineHeight:16},
 reviewWrap:{marginTop:12},reviewHead:{flexDirection:"row",alignItems:"center",gap:8},refresh:{backgroundColor:"#202124",padding:10,borderRadius:9},images:{flexDirection:"row",gap:10,marginVertical:8},imageCell:{flex:1},reviewImage:{width:"100%",height:170,resizeMode:"contain",backgroundColor:"#f4f6f9",borderRadius:8},actions:{flexDirection:"row",gap:10,marginTop:8},approve:{flex:1,backgroundColor:"#218653",padding:12,borderRadius:9,alignItems:"center"},reject:{padding:12,borderRadius:9,borderWidth:1,borderColor:"#c33",alignItems:"center"},rejectText:{color:"#b42318",fontSize:12,fontWeight:"900"}
});
