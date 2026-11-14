import React, { useRef, useState } from "react";
import { ScrollView, View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { supabase } from "../lib/supabase";

type CheckoutItem = { id: string; title: string; price_mwk: number; quantity: number; demo?: boolean };
type PaymentInfo = { reference: string; timed_account_number: string; expires_at: string; amount_mwk: number };

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
  const [busy,setBusy]=useState(false);
  const [orderId,setOrderId]=useState("");
  const [payment,setPayment]=useState<PaymentInfo|null>(null);
  const [error,setError]=useState("");
  const submitLock=useRef(false);
  const paymentLock=useRef(false);
  const subtotal=items.reduce((sum,item)=>sum+Number(item.price_mwk)*item.quantity,0);
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
        p_notes:notes.trim()||null,p_idempotency_key:makeUuid()
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
      <Text style={s.label}>Delivery address (include area and district)</Text><TextInput value={address} onChangeText={setAddress} style={[s.input,{height:82,textAlignVertical:"top"}]} multiline placeholder="House, street/area, town or district"/>
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
 root:{flex:1,backgroundColor:"#f4f6f9"},content:{padding:19,paddingBottom:120},back:{paddingVertical:8},backText:{color:"#ef7b25",fontWeight:"800"},title:{fontSize:27,fontWeight:"900",color:"#172b4d",marginTop:10,marginBottom:17,letterSpacing:-.5},sub:{fontSize:15,fontWeight:"900",color:"#172b4d",marginTop:17,marginBottom:5},label:{fontSize:11,fontWeight:"800",color:"#4e5b6e",marginTop:13,marginBottom:6},input:{backgroundColor:"#fff",borderWidth:1,borderColor:"#e4e9f0",borderRadius:12,padding:14,fontSize:14,color:"#172b4d"},item:{backgroundColor:"#fff",padding:14,borderRadius:14,marginTop:9,flexDirection:"row",alignItems:"center",gap:10},itemTitle:{fontSize:12,fontWeight:"800",color:"#172b4d"},body:{fontSize:11,color:"#667085",lineHeight:17,marginTop:4},itemPrice:{fontSize:12,fontWeight:"900",color:"#172b4d"},totalRow:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",marginTop:12},totalLabel:{fontSize:12,fontWeight:"700",color:"#536073"},total:{fontSize:14,fontWeight:"800",color:"#172b4d"},grandTotal:{fontSize:20,fontWeight:"900",color:"#ef7b25"},small:{fontSize:10,color:"#788293",lineHeight:16,marginTop:12},button:{backgroundColor:"#ef7628",padding:16,borderRadius:12,alignItems:"center",marginTop:18,minHeight:48,justifyContent:"center"},buttonText:{color:"#fff",fontWeight:"900",fontSize:12},error:{fontSize:11,color:"#b42318",fontWeight:"700",marginTop:13},notice:{backgroundColor:"#fff1e5",padding:13,borderRadius:9,marginTop:16},noticeText:{fontSize:11,color:"#854d22",fontWeight:"700",lineHeight:17},success:{backgroundColor:"#eaf7ef",padding:13,borderRadius:9,marginBottom:14},successTitle:{fontSize:14,fontWeight:"900",color:"#176b3a",marginBottom:5},amount:{fontSize:23,fontWeight:"900",color:"#ef7b25"},tan:{backgroundColor:"#172b4d",borderRadius:12,padding:20,alignItems:"center",marginTop:4},tanText:{fontSize:28,fontWeight:"900",letterSpacing:3,color:"#fff"}
});
