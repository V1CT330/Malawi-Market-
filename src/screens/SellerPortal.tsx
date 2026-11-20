import React,{useEffect,useMemo,useRef,useState} from "react";
import {ScrollView,View,Text,TextInput,Pressable,StyleSheet,Alert,ActivityIndicator,Image,Linking} from "react-native";
import * as ImagePicker from "expo-image-picker";
import {supabase} from "../lib/supabase";
import {SellerKycVerification} from "../components/KycVerification";

type Seller={id:string;name:string;status:"pending"|"active"|"suspended";description?:string|null;location?:string|null;whatsapp_url?:string|null;logo_url?:string|null;banner_url?:string|null};
type Category={id:string;name:string;slug:string};
type Listing={id:string;title:string;description?:string|null;price_mwk:number;status:string;stock_quantity:number;category_id:string;condition:string;location?:string|null;images?:{id:string;image_url:string;is_primary:boolean;sort_order:number}[]};
type PickedImage={uri:string;mimeType:string;fileSize?:number};
const money=(n:number)=>"MK "+Number(n||0).toLocaleString("en-US");
const slugify=(v:string)=>v.toLowerCase().trim().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");

export function SellerPortal(){
 const [seller,setSeller]=useState<Seller|null>(null);const [kycStatus,setKycStatus]=useState<"none"|"pending"|"approved"|"rejected">("none");const [loading,setLoading]=useState(true);const [busy,setBusy]=useState(false);const actionLock=useRef(false);
 const [name,setName]=useState("");const [location,setLocation]=useState("");const [storeDescription,setStoreDescription]=useState("");const [productDescription,setProductDescription]=useState("");const [whatsapp,setWhatsapp]=useState("");
 const [logoUrl,setLogoUrl]=useState("");const [bannerUrl,setBannerUrl]=useState("");const [pickedLogo,setPickedLogo]=useState<PickedImage|null>(null);const [pickedBanner,setPickedBanner]=useState<PickedImage|null>(null);
 const [title,setTitle]=useState("");const [price,setPrice]=useState("");const [category,setCategory]=useState("");const [condition,setCondition]=useState("new");const [quantity,setQuantity]=useState("1");const [imageUrl,setImageUrl]=useState("");const [pickedImages,setPickedImages]=useState<PickedImage[]>([]);const [existingImages,setExistingImages]=useState<{id:string;image_url:string;is_primary:boolean;sort_order:number}[]>([]);
 const [editingId,setEditingId]=useState<string|null>(null);const [categories,setCategories]=useState<Category[]>([]);const [myProducts,setMyProducts]=useState<Listing[]>([]);const [orderItems,setOrderItems]=useState<any[]>([]);
 const load=async()=>{
  setLoading(true);
  try{
   const [{data:{user},error:userError},{data:cats,error:catError}]=await Promise.all([supabase.auth.getUser(),supabase.from("market_categories").select("id,name,slug").eq("is_active",true).order("sort_order")]);
   if(userError)throw userError;if(catError)throw catError;setCategories((cats??[]) as Category[]);
   if(user){
    const {data:profile,error}=await supabase.from("market_sellers").select("id,name,status,description,location,whatsapp_url,logo_url,banner_url").eq("auth_user_id",user.id).maybeSingle();
    if(error)throw error;setSeller(profile as Seller|null);
    if(profile){
     setName(profile.name??"");setLocation(profile.location??"");setStoreDescription(profile.description??"");setWhatsapp(profile.whatsapp_url??"");setLogoUrl(profile.logo_url??"");setBannerUrl(profile.banner_url??"");
     const [{data:products,error:productError},{data:orders,error:orderError}]=await Promise.all([
      supabase.from("market_products").select("id,title,description,price_mwk,status,stock_quantity,category_id,condition,location,images:market_product_images(id,image_url,is_primary,sort_order)").eq("seller_id",profile.id).order("created_at",{ascending:false}),
      supabase.from("market_order_items").select("id,product_title,unit_price_mwk,quantity,fulfillment_status,order:market_orders(id,status,payment_status,delivery_name,delivery_phone,delivery_address,delivery_latitude,delivery_longitude,delivery_landmark,created_at)").eq("seller_id",profile.id).order("created_at",{ascending:false})
     ]);
     if(productError)throw productError;if(orderError)throw orderError;setMyProducts((products??[]) as Listing[]);setOrderItems(orders??[]);
    }else{setMyProducts([]);setOrderItems([]);}
   }
  }catch(e:any){Alert.alert("Seller Centre",e?.message||"Could not load seller information.");}
  finally{setLoading(false);}
 };
 useEffect(()=>{void load();},[]);
 const paidItems=orderItems.filter(x=>x.order?.payment_status==="paid");
 const revenue=paidItems.reduce((sum,x)=>sum+Number(x.unit_price_mwk)*Number(x.quantity),0);
 const pickImage=async()=>{
  const available=6-existingImages.length-pickedImages.length;
  if(available<=0){Alert.alert("Photo limit reached","A product can have up to six photos. Remove an existing photo before adding more.");return;}
  const result=await ImagePicker.launchImageLibraryAsync({mediaTypes:["images"],allowsMultipleSelection:true,selectionLimit:available,quality:.8});
  if(result.canceled)return;
  const assets=result.assets??[];
  for(const asset of assets){
   if(asset.fileSize&&asset.fileSize>5*1024*1024){Alert.alert("Image too large","Each product photo must be under 5 MB.");return;}
   if(!["image/jpeg","image/png","image/webp"].includes(asset.mimeType??"image/jpeg")){Alert.alert("Unsupported image","Choose JPEG, PNG or WebP photos.");return;}
  }
  setPickedImages(current=>[...current,...assets.map(asset=>({uri:asset.uri,mimeType:asset.mimeType??"image/jpeg",fileSize:asset.fileSize}))].slice(0,available));
 };
 const clearForm=()=>{setEditingId(null);setTitle("");setPrice("");setQuantity("1");setImageUrl("");setPickedImages([]);setExistingImages([]);setProductDescription("");setCategory("");setCondition("new");};
 const startEdit=(item:Listing)=>{
  setEditingId(item.id);setTitle(item.title);setPrice(String(item.price_mwk));setQuantity(String(item.stock_quantity));setProductDescription(item.description??"");setCategory(item.category_id);setCondition(item.condition);setImageUrl("");setExistingImages([...(item.images??[])].sort((a,b)=>a.sort_order-b.sort_order));setPickedImages([]);
 };
 const apply=async()=>{
  if(actionLock.current)return;
  if(kycStatus!=="approved"){Alert.alert("Identity verification required","Complete identity verification and wait for approval before applying to sell.");return;}
  if(name.trim().length<2||location.trim().length<2){Alert.alert("Missing details","Enter your store name and location.");return;}
  actionLock.current=true;setBusy(true);
  try{
   const {data:{user},error:userError}=await supabase.auth.getUser();
   if(userError)throw userError;
   if(!user){Alert.alert("Sign in required","Sign in before applying for a seller account.");return;}
   const slug=slugify(name)+"-"+user.id.slice(0,6);
   const {error}=await supabase.from("market_sellers").insert({auth_user_id:user.id,name:name.trim(),slug,location:location.trim(),description:storeDescription.trim(),status:"pending"});
   if(error)throw error;
   Alert.alert("Application submitted","Your seller profile is awaiting administrator approval.");await load();
  }catch(e:any){Alert.alert("Application failed",e?.message||"Please try again.");}
  finally{setBusy(false);actionLock.current=false;}
 };
 const saveListing=async()=>{
  if(actionLock.current)return;
  const amount=Number(price),stock=Number(quantity),cat=categories.find(x=>x.id===category);
  if(!seller||seller.status!=="active")return;
  if(kycStatus!=="approved"){Alert.alert("Identity verification required","Your KYC must be approved before publishing or editing products.");return;}
  if(title.trim().length<3||!Number.isSafeInteger(amount)||amount<=0||!Number.isInteger(stock)||stock<0||!cat){Alert.alert("Check listing","Enter a title, valid whole-number price, stock quantity and category.");return;}
  if(imageUrl.trim()&&!/^https:\/\//i.test(imageUrl.trim())){Alert.alert("Invalid image URL","Use HTTPS or choose a photo from your device.");return;}
  if(existingImages.length+pickedImages.length+(imageUrl.trim()?1:0)>6){Alert.alert("Photo limit reached","A product can have up to six photos.");return;}
  actionLock.current=true;setBusy(true);
  const uploadedPaths:string[]=[];
  try{
   const {data:{user}}=await supabase.auth.getUser();if(!user)throw new Error("Sign in again to continue.");
   let productId=editingId;
   const values={category_id:cat.id,title:title.trim(),slug:slugify(title)+"-"+Date.now().toString(36),description:productDescription.trim(),price_mwk:amount,condition,stock_quantity:stock,location:location.trim(),...(editingId?{}:{seller_id:seller.id,status:"published",published_at:new Date().toISOString()})};
   if(editingId){const {error}=await supabase.from("market_products").update(values).eq("id",editingId).eq("seller_id",seller.id);if(error)throw error;}
   else{const {data,error}=await supabase.from("market_products").insert(values).select("id").single();if(error)throw error;productId=data.id;}
   const imageRows:{product_id:string;image_url:string;is_primary:boolean;sort_order:number}[]=[];
   for(const [index,pickedImage] of pickedImages.entries()){
    const response=await fetch(pickedImage.uri);if(!response.ok)throw new Error("Could not read one of the selected photos.");
    const bytes=await response.arrayBuffer();const ext=pickedImage.mimeType==="image/png"?"png":pickedImage.mimeType==="image/webp"?"webp":"jpg";
    const path=user.id+"/products/"+productId+"-"+Date.now()+"-"+index+"."+ext;
    const {error:uploadError}=await supabase.storage.from("market-media").upload(path,bytes,{contentType:pickedImage.mimeType,upsert:false,cacheControl:"31536000"});
    if(uploadError)throw uploadError;uploadedPaths.push(path);
    imageRows.push({product_id:productId,image_url:supabase.storage.from("market-media").getPublicUrl(path).data.publicUrl,is_primary:existingImages.length===0&&imageRows.length===0,sort_order:existingImages.length+imageRows.length});
   }
   if(imageUrl.trim())imageRows.push({product_id:productId,image_url:imageUrl.trim(),is_primary:existingImages.length===0&&imageRows.length===0,sort_order:existingImages.length+imageRows.length});
   if(imageRows.length){const {error:imageError}=await supabase.from("market_product_images").insert(imageRows);if(imageError)throw imageError;}

   Alert.alert(editingId?"Listing updated":"Product published",editingId?"Your changes have been saved.":"Your product is now published.");
   clearForm();await load();
  }catch(e:any){if(uploadedPaths.length)await supabase.storage.from("market-media").remove(uploadedPaths);Alert.alert("Could not save listing",e?.message||"Please try again.");}
  finally{setBusy(false);actionLock.current=false;}
 };
 const pickStoreImage=async(kind:"logo"|"banner")=>{
  const result=await ImagePicker.launchImageLibraryAsync({mediaTypes:["images"],allowsEditing:true,aspect:kind==="logo"?[1,1]:[16,5],quality:.8});
  if(result.canceled||!result.assets[0])return;
  const asset=result.assets[0];
  if(asset.fileSize&&asset.fileSize>5*1024*1024){Alert.alert("Image too large","Choose an image under 5 MB.");return;}
  if(!["image/jpeg","image/png","image/webp"].includes(asset.mimeType??"image/jpeg")){Alert.alert("Unsupported image","Choose JPEG, PNG or WebP.");return;}
  const picked={uri:asset.uri,mimeType:asset.mimeType??"image/jpeg",fileSize:asset.fileSize};
  if(kind==="logo"){setPickedLogo(picked);setLogoUrl("");}else{setPickedBanner(picked);setBannerUrl("");}
 };
 const updateSeller=async()=>{
  if(actionLock.current||!seller)return;if(name.trim().length<2||location.trim().length<2){Alert.alert("Check store details","Store name and location are required.");return;}
  actionLock.current=true;setBusy(true);const uploadedPaths:string[]=[];
  try{
   const {data:{user}}=await supabase.auth.getUser();if(!user)throw new Error("Sign in again to continue.");
   const updates:any={name:name.trim(),slug:slugify(name)+"-"+seller.id.slice(0,6),description:storeDescription.trim(),location:location.trim(),whatsapp_url:whatsapp.trim()||null};
   for(const kind of ["logo","banner"] as const){
    const picked=kind==="logo"?pickedLogo:pickedBanner;
    if(!picked)continue;
    const ext=picked.mimeType==="image/png"?"png":picked.mimeType==="image/webp"?"webp":"jpg";
    const path=user.id+"/stores/"+seller.id+"/"+kind+"-"+Date.now()+"."+ext;
    const response=await fetch(picked.uri);if(!response.ok)throw new Error("Could not read the selected store image.");
    const bytes=await response.arrayBuffer();
    const {error:uploadError}=await supabase.storage.from("market-media").upload(path,bytes,{contentType:picked.mimeType,upsert:false,cacheControl:"31536000"});
    if(uploadError)throw uploadError;uploadedPaths.push(path);
    const url=supabase.storage.from("market-media").getPublicUrl(path).data.publicUrl;
    if(kind==="logo")updates.logo_url=url;else updates.banner_url=url;
   }
   const {error}=await supabase.from("market_sellers").update(updates).eq("id",seller.id);if(error)throw error;
   setPickedLogo(null);setPickedBanner(null);Alert.alert("Store updated","Your store profile and branding were saved.");await load();
  }catch(e:any){if(uploadedPaths.length)await supabase.storage.from("market-media").remove(uploadedPaths);Alert.alert("Update failed",e?.message||"Could not update store.");}
  finally{setBusy(false);actionLock.current=false;}
 };
 const setFulfilment=async(item:any,status:"shipped"|"delivered")=>{
  if(actionLock.current)return;
  actionLock.current=true;setBusy(true);
  try{const {error}=await supabase.rpc("update_market_order_item_status",{p_item_id:item.id,p_status:status,p_seller_note:null});if(error)throw error;await load();}
  catch(e:any){Alert.alert("Update failed",e?.message||"Could not update fulfilment.");}
  finally{actionLock.current=false;setBusy(false);}
 };
 if(loading)return <View style={s.center}><ActivityIndicator color="#ef7b25"/><Text style={s.meta}>Loading seller account…</Text></View>;
 if(!seller)return <ScrollView contentContainerStyle={s.wrap}><Text style={s.title}>Become a seller</Text><Text style={s.meta}>One account for shopping and selling. Verify your identity first; seller access is a separate approval step.</Text><SellerKycVerification onStatusChange={setKycStatus}/>{kycStatus==="approved"?<><Text style={s.section}>Create your store</Text><Text style={s.label}>Store name</Text><TextInput value={name} onChangeText={setName} style={s.input} placeholder="Your business or shop name"/><Text style={s.label}>City / District</Text><TextInput value={location} onChangeText={setLocation} style={s.input} placeholder="e.g. Lilongwe"/><Text style={s.label}>About your store</Text><TextInput value={storeDescription} onChangeText={setStoreDescription} style={[s.input,{height:90,textAlignVertical:"top"}]} multiline/><Pressable disabled={busy} style={s.button} onPress={()=>void apply()}>{busy?<ActivityIndicator color="#fff"/>:<Text style={s.buttonText}>Submit seller application</Text>}</Pressable></>:<View style={s.notice}><Text style={s.noticeText}>The seller application form unlocks after identity verification is approved.</Text></View>}</ScrollView>;
 if(seller.status==="pending")return <ScrollView contentContainerStyle={s.wrap}><Text style={s.title}>Application pending</Text><Text style={s.meta}>Store: {seller.name}</Text><SellerKycVerification onStatusChange={setKycStatus}/><View style={s.notice}><Text style={s.noticeText}>Your seller application awaits administrator approval. Identity approval and seller approval are separate checks.</Text></View></ScrollView>;
 if(seller.status!=="active")return <View style={s.wrap}><Text style={s.title}>Seller account unavailable</Text><Text style={s.meta}>Contact Malawi Market support.</Text></View>;
 return <ScrollView contentContainerStyle={s.wrap}>
  <Text style={s.title}>Seller Centre</Text><Text style={s.meta}>{seller.name} · Approved seller</Text><SellerKycVerification onStatusChange={setKycStatus}/>{kycStatus!=="approved"?<View style={s.notice}><Text style={s.noticeText}>Product publishing and listing edits are locked until your identity verification is approved.</Text></View>:null}
  <View style={s.stats}><View style={s.stat}><Text style={s.statValue}>{myProducts.length}</Text><Text style={s.statLabel}>Listings</Text></View><View style={s.stat}><Text style={s.statValue}>{paidItems.length}</Text><Text style={s.statLabel}>Paid items</Text></View><View style={s.stat}><Text style={s.statValue}>{money(revenue)}</Text><Text style={s.statLabel}>Gross sales</Text></View></View>
  <Text style={s.section}>Store profile</Text>
  <Text style={s.label}>Store banner</Text>{pickedBanner?<Image source={{uri:pickedBanner.uri}} style={s.storeBannerPreview}/>:bannerUrl?<Image source={{uri:bannerUrl}} style={s.storeBannerPreview}/>:null}<Pressable disabled={busy} style={s.secondary} onPress={()=>void pickStoreImage("banner")}><Text style={s.secondaryText}>Choose store banner</Text></Pressable>
  <Text style={s.label}>Store logo</Text>{pickedLogo?<Image source={{uri:pickedLogo.uri}} style={s.storeLogoPreview}/>:logoUrl?<Image source={{uri:logoUrl}} style={s.storeLogoPreview}/>:null}<Pressable disabled={busy} style={s.secondary} onPress={()=>void pickStoreImage("logo")}><Text style={s.secondaryText}>Choose store logo</Text></Pressable>
  <Text style={s.label}>Store name</Text><TextInput value={name} onChangeText={setName} style={s.input}/><Text style={s.label}>Location</Text><TextInput value={location} onChangeText={setLocation} style={s.input}/><Text style={s.label}>Description</Text><TextInput value={storeDescription} onChangeText={setStoreDescription} style={[s.input,{height:70,textAlignVertical:"top"}]} multiline/><Text style={s.label}>WhatsApp contact URL (optional)</Text><TextInput value={whatsapp} onChangeText={setWhatsapp} style={s.input} autoCapitalize="none" placeholder="https://wa.me/265..."/><Pressable disabled={busy} style={s.secondary} onPress={()=>void updateSeller()}><Text style={s.secondaryText}>Save store profile</Text></Pressable>
  <Text style={s.section}>{editingId?"Edit listing":"Publish a product"}</Text>
  <Text style={s.label}>Product title</Text><TextInput value={title} onChangeText={setTitle} style={s.input} placeholder="Product name"/>
  <Text style={s.label}>Price (MWK)</Text><TextInput value={price} onChangeText={setPrice} keyboardType="numeric" style={s.input} placeholder="e.g. 250000"/>
  <Text style={s.label}>Category</Text><View style={s.pills}>{categories.map(c=><Pressable key={c.id} onPress={()=>setCategory(c.id)} style={[s.pill,category===c.id&&s.pillActive]}><Text style={[s.pillText,category===c.id&&{color:"#fff"}]}>{c.name}</Text></Pressable>)}</View>
  <Text style={s.label}>Condition</Text><View style={s.pills}>{["new","used","refurbished"].map(v=><Pressable key={v} onPress={()=>setCondition(v)} style={[s.pill,condition===v&&s.pillActive]}><Text style={[s.pillText,condition===v&&{color:"#fff"}]}>{v}</Text></Pressable>)}</View>
  <Text style={s.label}>Stock quantity</Text><TextInput value={quantity} onChangeText={setQuantity} keyboardType="numeric" style={s.input}/>
  <Text style={s.label}>Product location</Text><TextInput value={location} onChangeText={setLocation} style={s.input}/>
  <Text style={s.label}>Product photos · up to 6</Text>
  {(existingImages.length>0||pickedImages.length>0)?<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:9,paddingVertical:8}}>
   {existingImages.map(image=><View key={image.id} style={{position:"relative"}}><Image source={{uri:image.image_url}} style={s.galleryPreview}/><Text style={s.photoTag}>{image.is_primary?"COVER":"EXISTING"}</Text></View>)}
   {pickedImages.map((image,index)=><View key={image.uri+index} style={{position:"relative"}}><Image source={{uri:image.uri}} style={s.galleryPreview}/><Text style={s.photoTag}>NEW PHOTO</Text></View>)}
  </ScrollView>:null}
  <Pressable disabled={busy} style={s.secondary} onPress={()=>void pickImage()}><Text style={s.secondaryText}>Add photos from device ({existingImages.length+pickedImages.length}/6)</Text></Pressable>
  <TextInput value={imageUrl} onChangeText={setImageUrl} autoCapitalize="none" style={s.input} placeholder="Or add one HTTPS image URL"/>
  <Text style={s.label}>Description</Text><TextInput value={productDescription} onChangeText={setProductDescription} multiline style={[s.input,{height:90,textAlignVertical:"top"}]} placeholder="Describe your product"/>
  <Text style={s.small}>Photos are stored in the Malawi Market media bucket. Maximum image size: 5 MB.</Text>
  <Pressable disabled={busy||kycStatus!=="approved"} style={s.button} onPress={()=>void saveListing()}>{busy?<ActivityIndicator color="#fff"/>:<Text style={s.buttonText}>{editingId?"Save listing changes":"Publish product"}</Text>}</Pressable>{editingId?<Pressable style={s.secondary} onPress={clearForm}><Text style={s.secondaryText}>Cancel editing</Text></Pressable>:null}
  <Text style={s.section}>Your listings ({myProducts.length})</Text>
  {!myProducts.length?<View style={s.notice}><Text style={s.noticeText}>You have no listings yet. Add a product above to start selling on Malawi Market.</Text></View>:null}
  {myProducts.map(item=><View key={item.id} style={s.listing}><View style={{flex:1}}><Text style={s.listingTitle}>{item.title}</Text><Text style={s.meta}>{money(item.price_mwk)} · Stock {item.stock_quantity} · {item.status.toUpperCase()}</Text></View><View style={s.actions}><Pressable disabled={busy||kycStatus!=="approved"} onPress={()=>startEdit(item)}><Text style={s.action}>Edit</Text></Pressable><Pressable disabled={busy||kycStatus!=="approved"} onPress={async()=>{if(actionLock.current)return;actionLock.current=true;setBusy(true);try{const next=item.status==="published"?"archived":"published";const {error}=await supabase.from("market_products").update({status:next,published_at:next==="published"?new Date().toISOString():null}).eq("id",item.id);if(error)throw error;await load();}catch(e:any){Alert.alert("Update failed",e?.message||"Could not update listing.");}finally{actionLock.current=false;setBusy(false);}}}><Text style={s.action}>{item.status==="published"?"Archive":"Republish"}</Text></Pressable></View></View>)}
  <Text style={s.section}>Customer orders ({paidItems.length})</Text>
  {paidItems.map(item=><View key={item.id} style={s.listing}><View style={{flex:1}}><Text style={s.listingTitle}>{item.product_title} × {item.quantity}</Text><Text style={s.meta}>Order {String(item.order.id).slice(0,8)} · {money(Number(item.unit_price_mwk)*Number(item.quantity))} · {String(item.fulfillment_status).replace(/_/g," ")}</Text><Text style={s.meta}>Deliver to: {item.order.delivery_name} · {item.order.delivery_phone}</Text><Text style={s.meta}>{item.order.delivery_address}</Text>{item.order.delivery_landmark?<Text style={s.meta}>Landmark: {item.order.delivery_landmark}</Text>:null}{item.order.delivery_latitude!==null&&item.order.delivery_longitude!==null?<Text style={s.meta}>GPS pin: {Number(item.order.delivery_latitude).toFixed(5)}, {Number(item.order.delivery_longitude).toFixed(5)}</Text>:null}<Pressable onPress={()=>{const url=item.order.delivery_latitude!==null&&item.order.delivery_longitude!==null?"https://www.google.com/maps/dir/?api=1&destination="+item.order.delivery_latitude+","+item.order.delivery_longitude:"https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(item.order.delivery_address);void Linking.openURL(url);}}><Text style={s.action}>Open delivery location ↗</Text></Pressable></View><View style={s.actions}>{item.fulfillment_status==="processing"?<Pressable disabled={busy} onPress={()=>void setFulfilment(item,"shipped")}><Text style={s.action}>Mark shipped</Text></Pressable>:null}{item.fulfillment_status==="shipped"||item.fulfillment_status==="ready_for_pickup"?<Pressable disabled={busy} onPress={()=>void setFulfilment(item,"delivered")}><Text style={s.action}>Mark delivered</Text></Pressable>:null}</View></View>)}
  {!paidItems.length?<Text style={s.meta}>Paid orders will appear here. Do not fulfil orders awaiting payment.</Text>:null}
 </ScrollView>;
}
const s=StyleSheet.create({wrap:{padding:18,paddingBottom:115,backgroundColor:"#f4f6f9"},center:{padding:30,alignItems:"center"},title:{fontSize:27,fontWeight:"900",color:"#252a31",marginTop:10,marginBottom:9,letterSpacing:-.5},section:{fontSize:17,fontWeight:"900",color:"#252a31",marginTop:24,marginBottom:7},meta:{fontSize:12,color:"#4b5563",lineHeight:17},label:{fontSize:12,fontWeight:"800",color:"#414b59",marginTop:15,marginBottom:6},input:{backgroundColor:"#fff",borderWidth:1,borderColor:"#cbd1d9",borderRadius:12,padding:14,fontSize:14,color:"#252a31"},button:{backgroundColor:"#155EEF",paddingHorizontal:18,paddingVertical:14,borderRadius:12,alignItems:"center",marginTop:18,minHeight:50,justifyContent:"center"},buttonText:{color:"#fff",fontWeight:"800",fontSize:14},secondary:{backgroundColor:"#202124",borderWidth:1,borderColor:"#202124",padding:12,borderRadius:9,alignItems:"center",marginTop:9},secondaryText:{color:"#ffffff",fontSize:12,fontWeight:"800"},notice:{backgroundColor:"#fff1e5",padding:12,borderRadius:9,marginTop:14},noticeText:{fontSize:12,color:"#854d22",fontWeight:"700",lineHeight:16},listing:{backgroundColor:"#fff",borderWidth:0,borderColor:"#d9dde3",borderRadius:14,padding:14,marginTop:8,flexDirection:"row",alignItems:"center",gap:10},listingTitle:{fontSize:12,fontWeight:"800",color:"#252a31"},action:{fontSize:12,fontWeight:"900",color:"#ef7b25",paddingVertical:5},actions:{gap:6,alignItems:"flex-end"},pills:{flexDirection:"row",flexWrap:"wrap",gap:7},pill:{backgroundColor:"#fff",borderWidth:1,borderColor:"#cbd1d9",borderRadius:18,paddingVertical:8,paddingHorizontal:11},pillActive:{backgroundColor:"#f36f21",borderColor:"#f36f21"},pillText:{fontSize:12,color:"#414b59",fontWeight:"700"},stats:{flexDirection:"row",gap:8,marginTop:16},stat:{flex:1,backgroundColor:"#fff",padding:10,borderRadius:10,borderWidth:1,borderColor:"#d9dde3"},statValue:{fontSize:14,fontWeight:"900",color:"#252a31"},statLabel:{fontSize:12,color:"#4b5563",marginTop:4},storeBannerPreview:{width:"100%",height:116,borderRadius:10,marginTop:8,backgroundColor:"#eef1f4"},storeLogoPreview:{width:90,height:90,borderRadius:45,marginTop:8,backgroundColor:"#eef1f4"},preview:{width:"100%",height:160,borderRadius:10,marginTop:8,backgroundColor:"#eef1f4"},galleryPreview:{width:118,height:112,borderRadius:10,backgroundColor:"#eef1f4"},photoTag:{position:"absolute",left:5,bottom:5,backgroundColor:"#172b46",color:"#fff",fontSize:9,fontWeight:"900",paddingHorizontal:5,paddingVertical:3,borderRadius:4},small:{fontSize:12,color:"#4b5563",marginTop:8,lineHeight:15}});
