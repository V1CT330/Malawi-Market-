import React, { useEffect, useRef, useState } from "react";
import { ScrollView, View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, Alert, Image, Linking } from "react-native";
import * as Location from "expo-location";
import { requestDeviceCoordinates, mapboxStaticImageUrl, Coordinates } from "../lib/live-services";
import { supabase } from "../lib/supabase";

type CheckoutItem = { id: string; title: string; price_mwk: number; quantity: number; demo?: boolean };
type PaymentInfo = { reference: string; timed_account_number: string; expires_at: string; amount_mwk: number };
type SavedAddress = { id:string; label:string; recipient_name:string; phone:string; address:string; landmark:string|null; latitude:number|null; longitude:number|null; is_default:boolean };

const money = (n:number) => "MK " + Number(n || 0).toLocaleString("en-US");
function makeUuid() {
  const hex = (Date.now().toString(16) + Math.random().toString(16).slice(2)).padEnd(32,"0").slice(0,32);
  return hex.slice(0,8)+"-"+hex.slice(8,12)+"-4"+hex.slice(13,16)+"-a"+hex.slice(17,20)+"-"+hex.slice(20,32);
}

export function CheckoutScreen({ items, onBack, onComplete, onOrderCreated }: { items: CheckoutItem[]; onBack:()=>void; onComplete:()=>void; onOrderCreated:()=>void }) {
  const [name,setName]=useState("");
  const [phone,setPhone]=useState("");
  const [address,setAddress]=useState("");
  const [notes,setNotes]=useState("");
  const [landmark,setLandmark]=useState("");
  const [addressLabel,setAddressLabel]=useState("Home");
  const [coordinates,setCoordinates]=useState<Coordinates|null>(null);
  const [savedAddresses,setSavedAddresses]=useState<SavedAddress[]>([]);
  const [locating,setLocating]=useState(false);
  const [savingAddress,setSavingAddress]=useState(false);
  const [busy,setBusy]=useState(false);
  const [orderId,setOrderId]=useState("");
  const [payment,setPayment]=useState<PaymentInfo|null>(null);
  const [error,setError]=useState("");
  const submitLock=useRef(false);
  const paymentLock=useRef(false);
  const subtotal=items.reduce((sum,item)=>sum+Number(item.price_mwk)*item.quantity,0);
  useEffect(()=>{
    let active=true;
    void (async()=>{
      const {data:{user}}=await supabase.auth.getUser();
      if(!user)return;
      const {data,error:loadError}=await supabase.from("market_delivery_addresses").select("id,label,recipient_name,phone,address,landmark,latitude,longitude,is_default").eq("buyer_user_id",user.id).order("is_default",{ascending:false}).order("updated_at",{ascending:false});
      if(!active)return;
      if(loadError){setError("Saved delivery addresses are temporarily unavailable. You can still enter your address manually.");return;}
      const rows=(data??[]) as SavedAddress[];setSavedAddresses(rows);
      const preferred=rows.find(x=>x.is_default)??rows[0];
      if(preferred){setName(preferred.recipient_name);setPhone(preferred.phone);setAddress(preferred.address);setLandmark(preferred.landmark??"");setAddressLabel(preferred.label);setCoordinates(preferred.latitude!==null&&preferred.longitude!==null?{latitude:preferred.latitude,longitude:preferred.longitude}:null);}
    })();
    return()=>{active=false;};
  },[]);
  const useMyLocation=async()=>{
    setLocating(true);setError("");
    try{
      const point=await requestDeviceCoordinates();setCoordinates(point);
      const results=await Location.reverseGeocodeAsync(point);
      const place=results[0];
      if(place){
        const parts=[place.name,place.street,place.district,place.city,place.region].filter((v,index,a)=>!!v&&a.indexOf(v)===index);
        if(parts.length)setAddress(parts.join(", "));
      }
    }catch(e:any){setError(e?.message||"Could not determine your current location. Enter your address manually.");}
    finally{setLocating(false);}
  };
  const saveAddress=async()=>{
    if(savedAddresses.length>=10){setError("You can save up to 10 delivery addresses. Remove an old address first.");return;}
    if(name.trim().length<2||phone.trim().replace(/[^0-9]/g,"").length<7||address.trim().length<5){setError("Enter a recipient name, valid phone number and full delivery address before saving.");return;}
    setSavingAddress(true);setError("");
    try{
      const {data:{user}}=await supabase.auth.getUser();if(!user)throw new Error("Sign in to save delivery addresses.");
      const makeDefault=savedAddresses.length===0;
      if(makeDefault){const {error:clearError}=await supabase.from("market_delivery_addresses").update({is_default:false}).eq("buyer_user_id",user.id);if(clearError)throw clearError;}
      const {data,error:insertError}=await supabase.from("market_delivery_addresses").insert({buyer_user_id:user.id,label:addressLabel.trim().slice(0,40)||"Other",recipient_name:name.trim(),phone:phone.trim(),address:address.trim(),landmark:landmark.trim()||null,latitude:coordinates?.latitude??null,longitude:coordinates?.longitude??null,is_default:makeDefault}).select("id,label,recipient_name,phone,address,landmark,latitude,longitude,is_default").single();
      if(insertError)throw insertError;
      setSavedAddresses(v=>[...v,data as SavedAddress]);
      Alert.alert("Address saved", "This delivery address is now available for future orders.");
    }catch(e:any){setError(e?.message||"Could not save this delivery address.");}
    finally{setSavingAddress(false);}
  };
  const chooseAddress=async(saved:SavedAddress)=>{
    setName(saved.recipient_name);setPhone(saved.phone);setAddress(saved.address);setLandmark(saved.landmark??"");setAddressLabel(saved.label);setCoordinates(saved.latitude!==null&&saved.longitude!==null?{latitude:saved.latitude,longitude:saved.longitude}:null);setError("");
    const {data:{user}}=await supabase.auth.getUser();if(!user)return;
    const {error:clearError}=await supabase.from("market_delivery_addresses").update({is_default:false}).eq("buyer_user_id",user.id);
    if(clearError){setError(clearError.message);return;}
    const {error:setErrorResult}=await supabase.from("market_delivery_addresses").update({is_default:true,updated_at:new Date().toISOString()}).eq("id",saved.id).eq("buyer_user_id",user.id);
    if(setErrorResult){setError(setErrorResult.message);return;}
    setSavedAddresses(v=>v.map(x=>({...x,is_default:x.id===saved.id})));
  };
  const removeAddress=async(saved:SavedAddress)=>{
    const {data:{user}}=await supabase.auth.getUser();if(!user)return;
    const {error:deleteError}=await supabase.from("market_delivery_addresses").delete().eq("id",saved.id).eq("buyer_user_id",user.id);
    if(deleteError){setError(deleteError.message);return;}
    const remaining=savedAddresses.filter(x=>x.id!==saved.id);
    if(saved.is_default&&remaining.length){const {error:defaultError}=await supabase.from("market_delivery_addresses").update({is_default:true,updated_at:new Date().toISOString()}).eq("id",remaining[0].id).eq("buyer_user_id",user.id);if(defaultError){setError(defaultError.message);return;}remaining[0]={...remaining[0],is_default:true};}
    setSavedAddresses(remaining);
    if(address===saved.address){setCoordinates(null);setLandmark("");setAddressLabel("Home");}
  };
  const startPayment=async(id:string)=>{
    if(paymentLock.current)return;
    paymentLock.current=true;
    setBusy(true);setError("");
    try {
      const {data,error:paymentError}=await supabase.functions.invoke("onekhusa-payments",{body:{action:"initiate",order_id:id}});
      if(paymentError) throw paymentError;
      if(data?.error) throw new Error(data.error);
      if(!data?.timed_account_number) throw new Error("OneKhusa did not return a payment number.");
      setPayment(data as PaymentInfo);
      onOrderCreated();
    } catch(e:any) {
      setError(e?.message||"Could not start the OneKhusa payment. Your order is saved; retry when payment service is configured.");
    } finally {paymentLock.current=false;setBusy(false);}
  };
  const submit=async()=>{
    if(submitLock.current)return;
    if(items.length===0||items.some(x=>x.demo)){setError("Demo products cannot be purchased. Remove them and use a published seller listing.");return;}
    if(!name.trim()||phone.trim().replace(/[^0-9]/g,"").length<7||address.trim().length<5){setError("Enter your full name, valid phone number and delivery address.");return;}
    submitLock.current=true;
    setBusy(true);setError("");
    try {
      const {data:{user}}=await supabase.auth.getUser();
      if(!user){Alert.alert("Sign in required","Sign in before placing an order.");return;}
      const {data:orderIdResult,error:orderError}=await supabase.rpc("create_market_order",{
        p_items:items.map(x=>({product_id:x.id,quantity:x.quantity})),
        p_delivery_name:name.trim(),p_delivery_phone:phone.trim(),p_delivery_address:address.trim(),
        p_notes:notes.trim()||null,p_idempotency_key:makeUuid(),
        p_delivery_latitude:coordinates?.latitude??null,p_delivery_longitude:coordinates?.longitude??null,p_delivery_landmark:landmark.trim()||null
      });
      if(orderError)throw orderError;
      const id=String(orderIdResult);
      setOrderId(id);
      await startPayment(id);
    } catch(e:any){setError(e?.message||"Could not create your order.");}
    finally{submitLock.current=false;setBusy(false);}
  };
  return <ScrollView style={s.root} contentContainerStyle={s.content}>
    <Pressable onPress={onBack} style={s.back}><Text style={s.backText}>‹  Back to cart</Text></Pressable>
    <Text style={s.title}>{payment?"Complete your payment":"Checkout"}</Text>
    {payment ? <>
      <View style={s.success}><Text style={s.successTitle}>Payment request created</Text><Text style={s.body}>Your order is saved as pending payment. Pay using the OneKhusa timed account number below. Your order will only be confirmed after OneKhusa verifies the payment.</Text></View>
      <Text style={s.label}>OneKhusa timed account number (TAN)</Text>
      <View style={s.tan}><Text selectable style={s.tanText}>{payment.timed_account_number}</Text></View>
      <Text style={s.label}>Amount to pay</Text><Text style={s.amount}>{money(payment.amount_mwk)}</Text>
      <Text style={s.label}>Payment reference</Text><Text selectable style={s.body}>{payment.reference}</Text>
      <Text style={s.label}>TAN expiry</Text><Text style={s.body}>{new Date(payment.expires_at).toLocaleString()}</Text>
      <View style={s.notice}><Text style={s.noticeText}>Open your supported bank or mobile-money channel, choose the OneKhusa payment/request-to-pay option and use this TAN with the exact amount. Do not send money to a personal number. If the TAN expires, retry payment from your order details.</Text></View>
      <Pressable style={s.button} onPress={onComplete}><Text style={s.buttonText}>Return to marketplace</Text></Pressable>
    </> : <>
      <Text style={s.sub}>Delivery details</Text>
      <Text style={s.label}>Recipient full name</Text><TextInput value={name} onChangeText={setName} style={s.input} placeholder="Name receiving the order"/>
      <Text style={s.label}>Phone number</Text><TextInput value={phone} onChangeText={setPhone} style={s.input} keyboardType="phone-pad" placeholder="+265..."/>
      {savedAddresses.length>0?<><Text style={s.label}>Saved delivery addresses</Text><View style={s.savedRow}>{savedAddresses.map(saved=><View key={saved.id} style={s.savedItem}><Pressable onPress={()=>void chooseAddress(saved)} style={[s.savedChip, addressLabel===saved.label&&address===saved.address?s.savedChipActive:null]}><Text style={s.savedChipText}>{saved.label}{saved.is_default?" · Default":""}</Text></Pressable><Pressable onPress={()=>void removeAddress(saved)} style={s.savedRemove}><Text style={s.savedRemoveText}>×</Text></Pressable></View>)}</View></>:null}
      <Text style={s.label}>Address label</Text><TextInput value={addressLabel} onChangeText={setAddressLabel} style={s.input} placeholder="Home, Work or Other" maxLength={40}/>
      <Text style={s.label}>Delivery address (include area, town and district)</Text><TextInput value={address} onChangeText={value=>{setAddress(value);setCoordinates(null);}} style={[s.input,{height:82,textAlignVertical:"top"}]} multiline placeholder="House, street/area, town or district"/>
      <Text style={s.label}>Landmark or drop-off instructions (optional)</Text><TextInput value={landmark} onChangeText={setLandmark} style={s.input} placeholder="Near the school gate, blue house, etc." maxLength={200}/>
      <View style={s.locationCard}>
        <Text style={s.locationTitle}>Precise delivery location</Text>
        <Text style={s.locationHint}>GPS is used only when you request a delivery pin. Malawi Market does not track you in the background. You can still order with a typed address.</Text>
        <Pressable disabled={locating} style={s.locationButton} onPress={()=>void useMyLocation()}>{locating?<ActivityIndicator color="#fff"/>:<Text style={s.locationButtonText}>◎  Use my current location</Text>}</Pressable>
        {coordinates?<><Text style={s.coordinateText}>Pin captured · {coordinates.latitude.toFixed(5)}, {coordinates.longitude.toFixed(5)}</Text>{mapboxStaticImageUrl(coordinates)?<Image source={{uri:mapboxStaticImageUrl(coordinates)}} style={s.mapPreview} resizeMode="cover"/>:null}<Pressable onPress={()=>void Linking.openURL("https://www.google.com/maps/search/?api=1&query="+coordinates.latitude+","+coordinates.longitude)}><Text style={s.mapLink}>Check this pin in Google Maps ↗</Text></Pressable></>:<Text style={s.coordinateText}>No GPS pin selected. Your written address will be used.</Text>}
        <Pressable disabled={savingAddress} style={s.saveAddressButton} onPress={()=>void saveAddress()}>{savingAddress?<ActivityIndicator color="#ef7628"/>:<Text style={s.saveAddressText}>＋ Save this delivery address</Text>}</Pressable>
      </View>
      <Text style={s.label}>Order notes (optional)</Text><TextInput value={notes} onChangeText={setNotes} style={[s.input,{height:68,textAlignVertical:"top"}]} multiline placeholder="Delivery instructions or other details"/>
      <Text style={s.sub}>Order summary</Text>
      {items.map(item=><View key={item.id} style={s.item}><View style={{flex:1}}><Text style={s.itemTitle}>{item.title}</Text><Text style={s.body}>{item.quantity} × {money(item.price_mwk)}</Text></View><Text style={s.itemPrice}>{money(item.price_mwk*item.quantity)}</Text></View>)}
      <View style={s.totalRow}><Text style={s.totalLabel}>Subtotal</Text><Text style={s.total}>{money(subtotal)}</Text></View>
      <View style={s.totalRow}><Text style={s.totalLabel}>Delivery fee</Text><Text style={s.total}>MK 0</Text></View>
      <Text style={s.small}>Delivery fee is currently not calculated in-app. Confirm any delivery charge with the seller before paying; this checkout will not add an undisclosed fee.</Text>
      <View style={s.totalRow}><Text style={s.totalLabel}>Total payable</Text><Text style={s.grandTotal}>{money(subtotal)}</Text></View>
      {error?<Text style={s.error}>{error}</Text>:null}
      {orderId?<Pressable disabled={busy} style={s.button} onPress={()=>void startPayment(orderId)}>{busy?<ActivityIndicator color="#fff"/>:<Text style={s.buttonText}>Retry OneKhusa payment setup</Text>}</Pressable>:
      <Pressable disabled={busy} style={s.button} onPress={()=>void submit()}>{busy?<ActivityIndicator color="#fff"/>:<Text style={s.buttonText}>Place order and get OneKhusa TAN</Text>}</Pressable>}
      <Text style={s.small}>Stock is reserved when the order is created. Cancel an unpaid order from Order History to release the reservation.</Text>
    </>}
  </ScrollView>;
}
const s=StyleSheet.create({
 root:{flex:1,backgroundColor:"#ffffff"},content:{padding:20,paddingBottom:125},savedRow:{flexDirection:"row",flexWrap:"wrap",gap:8,marginTop:3},savedItem:{flexDirection:"row",alignItems:"center",borderRadius:18,backgroundColor:"#f1f2f4",borderWidth:1,borderColor:"#d9dde3"},savedRemove:{paddingHorizontal:8,paddingVertical:5},savedRemoveText:{fontSize:16,fontWeight:"900",color:"#a33"},savedChip:{paddingVertical:8,paddingHorizontal:12,borderRadius:18,backgroundColor:"#f1f2f4",borderWidth:1,borderColor:"#d9dde3"},savedChipActive:{borderColor:"#ef7628",backgroundColor:"#fff1e5"},savedChipText:{fontSize:11,fontWeight:"800",color:"#414b59"},locationCard:{marginTop:15,padding:14,borderRadius:14,backgroundColor:"#f7f8fa",borderWidth:1,borderColor:"#e1e4e9"},locationTitle:{fontSize:14,fontWeight:"900",color:"#252a31"},locationHint:{fontSize:11,color:"#596273",lineHeight:16,marginTop:5},locationButton:{backgroundColor:"#252a31",padding:13,borderRadius:10,alignItems:"center",marginTop:12,minHeight:44,justifyContent:"center"},locationButtonText:{fontSize:12,fontWeight:"900",color:"#fff"},coordinateText:{fontSize:10,color:"#4b5563",marginTop:10},mapPreview:{height:150,width:"100%",borderRadius:10,marginTop:10,backgroundColor:"#e5e7eb"},mapLink:{fontSize:11,fontWeight:"800",color:"#1769aa",marginTop:8},saveAddressButton:{paddingVertical:10,alignItems:"center",marginTop:5},saveAddressText:{fontSize:11,fontWeight:"900",color:"#ef7628"},back:{paddingVertical:8},backText:{color:"#ef7b25",fontWeight:"800"},title:{fontSize:27,fontWeight:"700",color:"#202124",marginTop:10,marginBottom:18,letterSpacing:-.7},sub:{fontSize:15,fontWeight:"900",color:"#252a31",marginTop:17,marginBottom:5},label:{fontSize:11,fontWeight:"800",color:"#414b59",marginTop:13,marginBottom:6},input:{backgroundColor:"#f1f2f4",borderWidth:1,borderColor:"#d9dde3",borderRadius:12,padding:15,fontSize:13,color:"#202124"},item:{backgroundColor:"#f1f2f4",padding:15,borderRadius:14,marginTop:10,flexDirection:"row",alignItems:"center",gap:11,borderWidth:1,borderColor:"#d9dde3"},itemTitle:{fontSize:12,fontWeight:"800",color:"#252a31"},body:{fontSize:11,color:"#4b5563",lineHeight:17,marginTop:4},itemPrice:{fontSize:12,fontWeight:"900",color:"#252a31"},totalRow:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",marginTop:12},totalLabel:{fontSize:12,fontWeight:"700",color:"#414b59"},total:{fontSize:14,fontWeight:"800",color:"#252a31"},grandTotal:{fontSize:20,fontWeight:"900",color:"#ef7b25"},small:{fontSize:10,color:"#4b5563",lineHeight:16,marginTop:12},button:{backgroundColor:"#ef7628",padding:16,borderRadius:12,alignItems:"center",marginTop:18,minHeight:52,justifyContent:"center"},buttonText:{color:"#fff",fontWeight:"900",fontSize:12},error:{fontSize:11,color:"#b42318",fontWeight:"700",marginTop:13},notice:{backgroundColor:"#fff5ee",padding:13,borderRadius:12,marginTop:16},noticeText:{fontSize:11,color:"#854d22",fontWeight:"700",lineHeight:17},success:{backgroundColor:"#d9f2e2",padding:13,borderRadius:9,marginBottom:14},successTitle:{fontSize:14,fontWeight:"900",color:"#176b3a",marginBottom:5},amount:{fontSize:23,fontWeight:"900",color:"#ef7b25"},tan:{backgroundColor:"#202124",borderRadius:15,padding:20,alignItems:"center",marginTop:5},tanText:{fontSize:26,fontWeight:"700",letterSpacing:2,color:"#ffffff"}
});
