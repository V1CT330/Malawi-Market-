import React,{useEffect,useState} from "react";
import {ScrollView,View,Text,TextInput,Pressable,StyleSheet,Alert,ActivityIndicator} from "react-native";
import {supabase} from "../lib/supabase";

type Seller={id:string;name:string;status:"pending"|"active"|"suspended"};
type Category={id:string;name:string;slug:string};
export function SellerPortal(){
 const [seller,setSeller]=useState<Seller|null>(null); const [loading,setLoading]=useState(true); const [busy,setBusy]=useState(false);
 const [name,setName]=useState(""); const [location,setLocation]=useState(""); const [description,setDescription]=useState("");
 const [title,setTitle]=useState(""); const [price,setPrice]=useState(""); const [category,setCategory]=useState(""); const [condition,setCondition]=useState("new"); const [quantity,setQuantity]=useState("1"); const [imageUrl,setImageUrl]=useState("");
 const [categories,setCategories]=useState<Category[]>([]);
 const load=async()=>{
  setLoading(true);
  const [{data:{user}},{data:cats}] = await Promise.all([supabase.auth.getUser(),supabase.from("market_categories").select("id,name,slug").eq("is_active",true).order("sort_order")]);
  setCategories((cats??[]) as Category[]);
  if(user){const {data}=await supabase.from("market_sellers").select("id,name,status").eq("auth_user_id",user.id).maybeSingle();setSeller(data as Seller|null);}
  setLoading(false);
 };
 useEffect(()=>{void load();},[]);
 const apply=async()=>{
  const {data:{user}}=await supabase.auth.getUser();
  if(!user){Alert.alert("Sign in required","Sign in before applying for a seller account.");return;}
  if(name.trim().length<2||location.trim().length<2){Alert.alert("Missing details","Enter your store name and location.");return;}
  setBusy(true);
  try{
   const slug=name.trim().toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")+"-"+user.id.slice(0,6);
   const {error}=await supabase.from("market_sellers").insert({auth_user_id:user.id,name:name.trim(),slug,location:location.trim(),description:description.trim(),status:"pending"});
   if(error)throw error;
   Alert.alert("Application submitted","Your seller profile is pending administrator approval. You cannot publish products until it is approved.");
   await load();
  }catch(e:any){Alert.alert("Application failed",e?.message||"Please try again.");}
  finally{setBusy(false);}
 };
 const publish=async()=>{
  const amount=Number(price),stock=Number(quantity),cat=categories.find(x=>x.slug===category||x.name.toLowerCase()===category.toLowerCase());
  if(!seller||seller.status!=="active")return;
  if(title.trim().length<3||!Number.isFinite(amount)||amount<=0||!Number.isInteger(stock)||stock<0||!cat){Alert.alert("Check listing","Enter a title, valid price, stock quantity and choose a valid category.");return;}
  if(imageUrl.trim()&&!/^https:\/\//i.test(imageUrl.trim())){Alert.alert("Invalid image URL","Use a secure HTTPS image link.");return;}
  setBusy(true);
  try{
   const slug=title.trim().toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")+"-"+Date.now().toString(36);
   const {data:product,error}=await supabase.from("market_products").insert({seller_id:seller.id,category_id:cat.id,title:title.trim(),slug,description:description.trim(),price_mwk:Math.round(amount),condition,stock_quantity:stock,location:location.trim(),status:"published",published_at:new Date().toISOString()}).select("id").single();
   if(error)throw error;
   if(imageUrl.trim()){const {error:imageError}=await supabase.from("market_product_images").insert({product_id:product.id,image_url:imageUrl.trim(),is_primary:true,sort_order:0});if(imageError)throw imageError;}
   Alert.alert("Product published","Your listing has been submitted to the marketplace.");
   setTitle("");setPrice("");setQuantity("1");setImageUrl("");setDescription("");
  }catch(e:any){Alert.alert("Could not publish",e?.message||"Please try again.");}
  finally{setBusy(false);}
 };
 if(loading)return <View style={s.center}><ActivityIndicator color="#ef7b25"/><Text style={s.meta}>Loading seller account…</Text></View>;
 if(!seller)return <ScrollView contentContainerStyle={s.wrap}><Text style={s.title}>Become a seller</Text><Text style={s.meta}>Create a seller profile. Your application must be approved before you can publish products.</Text>
  <Text style={s.label}>Store name</Text><TextInput value={name} onChangeText={setName} style={s.input} placeholder="Your business or shop name"/>
  <Text style={s.label}>City / District</Text><TextInput value={location} onChangeText={setLocation} style={s.input} placeholder="e.g. Lilongwe"/>
  <Text style={s.label}>About your store</Text><TextInput value={description} onChangeText={setDescription} style={[s.input,{height:90,textAlignVertical:"top"}]} multiline placeholder="What do you sell?"/>
  <Pressable disabled={busy} style={s.button} onPress={()=>void apply()}>{busy?<ActivityIndicator color="#fff"/>:<Text style={s.buttonText}>Submit seller application</Text>}</Pressable>
 </ScrollView>;
 if(seller.status==="pending")return <View style={s.wrap}><Text style={s.title}>Application pending</Text><Text style={s.meta}>Store: {seller.name}</Text><View style={s.notice}><Text style={s.noticeText}>Your seller application is awaiting administrator approval. Product publishing is locked until approval.</Text></View></View>;
 if(seller.status!=="active")return <View style={s.wrap}><Text style={s.title}>Seller account unavailable</Text><Text style={s.meta}>Contact Malawi Market support for assistance with this seller account.</Text></View>;
 return <ScrollView contentContainerStyle={s.wrap}><Text style={s.title}>Seller Centre</Text><Text style={s.meta}>{seller.name} · Approved seller</Text>
  <Text style={s.label}>Product title</Text><TextInput value={title} onChangeText={setTitle} style={s.input} placeholder="Product name"/>
  <Text style={s.label}>Price (MWK)</Text><TextInput value={price} onChangeText={setPrice} keyboardType="numeric" style={s.input} placeholder="e.g. 250000"/>
  <Text style={s.label}>Category</Text><View style={s.pills}>{categories.map(c=><Pressable key={c.id} onPress={()=>setCategory(c.slug)} style={[s.pill,category===c.slug&&s.pillActive]}><Text style={[s.pillText,category===c.slug&&{color:"#fff"}]}>{c.name}</Text></Pressable>)}</View>
  <Text style={s.label}>Condition</Text><View style={s.pills}>{["new","used","refurbished"].map(v=><Pressable key={v} onPress={()=>setCondition(v)} style={[s.pill,condition===v&&s.pillActive]}><Text style={[s.pillText,condition===v&&{color:"#fff"}]}>{v}</Text></Pressable>)}</View>
  <Text style={s.label}>Stock quantity</Text><TextInput value={quantity} onChangeText={setQuantity} keyboardType="numeric" style={s.input}/>
  <Text style={s.label}>Product location</Text><TextInput value={location} onChangeText={setLocation} style={s.input} placeholder="City / District"/>
  <Text style={s.label}>Product image HTTPS URL (optional)</Text><TextInput value={imageUrl} onChangeText={setImageUrl} autoCapitalize="none" style={s.input} placeholder="https://..."/>
  <Text style={s.label}>Description</Text><TextInput value={description} onChangeText={setDescription} multiline style={[s.input,{height:100,textAlignVertical:"top"}]} placeholder="Describe your product"/>
  <View style={s.notice}><Text style={s.noticeText}>Listings publish immediately for approved sellers. Use a direct HTTPS image URL for now; in-app photo upload is not yet connected.</Text></View>
  <Pressable disabled={busy} style={s.button} onPress={()=>void publish()}>{busy?<ActivityIndicator color="#fff"/>:<Text style={s.buttonText}>Publish product</Text>}</Pressable>
 </ScrollView>;
}
const s=StyleSheet.create({wrap:{padding:16,paddingBottom:110,backgroundColor:"#f7f8fa"},center:{padding:30,alignItems:"center"},title:{fontSize:24,fontWeight:"900",color:"#172b4d",marginTop:8,marginBottom:7},meta:{fontSize:11,color:"#788293",lineHeight:17},label:{fontSize:11,fontWeight:"800",color:"#4e5b6e",marginTop:15,marginBottom:6},input:{backgroundColor:"#fff",borderWidth:1,borderColor:"#e2e6ec",borderRadius:9,padding:12,fontSize:13,color:"#172b4d"},button:{backgroundColor:"#ef7b25",padding:14,borderRadius:9,alignItems:"center",marginTop:18,minHeight:46,justifyContent:"center"},buttonText:{color:"#fff",fontWeight:"900"},notice:{backgroundColor:"#fff1e5",padding:12,borderRadius:9,marginTop:14},noticeText:{fontSize:10,color:"#854d22",fontWeight:"700",lineHeight:16},pills:{flexDirection:"row",flexWrap:"wrap",gap:7},pill:{backgroundColor:"#fff",borderWidth:1,borderColor:"#dfe4ea",borderRadius:18,paddingVertical:8,paddingHorizontal:11},pillActive:{backgroundColor:"#172b4d",borderColor:"#172b4d"},pillText:{fontSize:10,color:"#536073",fontWeight:"700"}});
