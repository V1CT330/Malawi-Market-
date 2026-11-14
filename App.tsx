import React, { useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  SafeAreaView, ScrollView, View, Text, TextInput, Image, Pressable, Linking, Alert,
  StatusBar, StyleSheet, FlatList, ActivityIndicator, RefreshControl, Platform, useWindowDimensions
} from "react-native";
import { supabase } from "./src/lib/supabase";
import { ExploreScreens } from "./src/screens/ExploreScreens";
import { AccountScreens } from "./src/screens/AccountScreens";
import { ProductReviews } from "./src/components/ProductReviews";
import { CheckoutScreen } from "./src/screens/CheckoutScreen";
import { marketText, MarketLanguage } from "./src/lib/i18n";

type Category = { id: string; name: string; slug: string; icon?: string | null };
type Product = {
  id: string;
  title: string;
  description?: string | null;
  price_mwk: number;
  compare_at_price_mwk?: number | null;
  condition: string;
  stock_quantity: number;
  location?: string | null;
  is_featured: boolean;
  category?: { name: string; slug: string } | null;
  seller?: { name: string; slug: string; location?: string | null; is_verified: boolean } | null;
  images?: { image_url: string; sort_order: number; is_primary: boolean }[];
  demo?: boolean;
};
type RawProduct = Omit<Product, "category" | "seller"> & { category?: Product["category"] | Product["category"][]; seller?: Product["seller"] | Product["seller"][] };
const money = (n: number) => "MK " + Number(n || 0).toLocaleString("en-US");
const productImage = (p: Product) =>
  p.images?.find(x => x.is_primary)?.image_url ??
  [...(p.images ?? [])].sort((a,b) => a.sort_order-b.sort_order)[0]?.image_url;

export default function App() {
  const { width: windowWidth } = useWindowDimensions();
  const isCompact = windowWidth < 360;
  const isTablet = windowWidth >= 600;
  const contentMaxWidth = windowWidth >= 900 ? 1180 : windowWidth >= 600 ? 900 : 680;
  const gridColumns = windowWidth >= 900 ? 4 : windowWidth >= 600 ? 3 : 2;
  const horizontalGutter = windowWidth >= 900 ? 24 : windowWidth >= 600 ? 20 : isCompact ? 10 : 14;
  const [tab, setTab] = useState("Home");
  const [language, setLanguage] = useState<MarketLanguage>("English");
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [checkout, setCheckout] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [sortBy, setSortBy] = useState("relevance");
  const [conditionFilter, setConditionFilter] = useState("all");
  const [cart, setCart] = useState<string[]>([]);
  const cartRef = useRef<string[]>([]);
  const [saved, setSaved] = useState<string[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selected, setSelected] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [storageReady, setStorageReady] = useState(false);

  const loadCatalogue = async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setLoadError("");
    try {
      const [categoryResult, productResult] = await Promise.all([
        supabase.from("market_categories").select("id,name,slug,icon").eq("is_active", true).order("sort_order"),
        supabase.from("market_products")
          .select("id,title,description,price_mwk,compare_at_price_mwk,condition,stock_quantity,location,is_featured,category:market_categories(name,slug),seller:market_sellers(name,slug,location,is_verified),images:market_product_images(image_url,sort_order,is_primary)")
          .eq("status", "published")
          .order("is_featured", { ascending: false })
          .order("published_at", { ascending: false }),
      ]);
      const liveProducts = ((productResult.data ?? []) as unknown as RawProduct[]).map(p => ({
        ...p,
        category: Array.isArray(p.category) ? (p.category[0] ?? null) : (p.category ?? null),
        seller: Array.isArray(p.seller) ? (p.seller[0] ?? null) : (p.seller ?? null),
      })) as Product[];
      setCategories((categoryResult.data ?? []) as Category[]);
      setProducts(liveProducts);
      if (productResult.error) setLoadError(productResult.error.message);
      else if (categoryResult.error) setLoadError(categoryResult.error.message);
    } catch (error:any) {
      setLoadError(error?.message || "The catalogue could not be loaded. Check your connection and try again.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { void loadCatalogue(); }, []);
  useEffect(() => {
    void AsyncStorage.getItem("@malawi-market/profile").then(raw => {
      if (!raw) return;
      try {
        const saved = JSON.parse(raw);
        if (["English","Chichewa","Tumbuka"].includes(saved.language)) setLanguage(saved.language);
      } catch {}
    });
  }, []);
  useEffect(() => {
    const handleAuthUrl = async (url: string | null) => {
      if (!url || !url.startsWith("mw.wealthgrid.malawimarket://auth/reset-password")) return;
      try {
        const parsed = new URL(url);
        const code = parsed.searchParams.get("code");
        if (code) await supabase.auth.exchangeCodeForSession(code);
        else {
          const params = new URLSearchParams(url.split("#")[1] || "");
          const access_token = params.get("access_token");
          const refresh_token = params.get("refresh_token");
          if (access_token && refresh_token) await supabase.auth.setSession({ access_token, refresh_token });
        }
        setPasswordRecovery(true);
        setTab("Account");
      } catch (error) {
        console.warn("Password recovery link could not be processed", error);
      }
    };
    void Linking.getInitialURL().then(handleAuthUrl);
    const subscription = Linking.addEventListener("url", event => { void handleAuthUrl(event.url); });
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    let active = true;
    Promise.all([AsyncStorage.getItem("@malawi-market/cart"), AsyncStorage.getItem("@malawi-market/wishlist")]).then(([c, w]) => {
      if (!active) return;
      try { if (c) { const restoredCart=JSON.parse(c); if(Array.isArray(restoredCart)){setCart(restoredCart);cartRef.current=restoredCart;} } } catch {}
      try { if (w) setSaved(JSON.parse(w)); } catch {}
      setStorageReady(true);
    }).catch(() => setStorageReady(true));
    return () => { active = false; };
  }, []);
  useEffect(() => { cartRef.current = cart; }, [cart]);
  useEffect(() => {
    if (!storageReady) return;
    void AsyncStorage.multiSet([["@malawi-market/cart", JSON.stringify(cart)], ["@malawi-market/wishlist", JSON.stringify(saved)]]);
  }, [cart, saved, storageReady]);

  const filtered = useMemo(() => {
    const rows = products.filter(p => {
      const matchesCategory = category === "all" || p.category?.slug === category;
      const searchText = query.trim().toLowerCase();
      const matchesQuery = !searchText || p.title.toLowerCase().includes(searchText) ||
        (p.description ?? "").toLowerCase().includes(searchText) ||
        (p.seller?.name ?? "").toLowerCase().includes(searchText) ||
        (p.category?.name ?? "").toLowerCase().includes(searchText) ||
        (p.location ?? "").toLowerCase().includes(searchText);
      const matchesCondition = conditionFilter === "all" || p.condition.toLowerCase() === conditionFilter;
      return matchesCategory && matchesQuery && matchesCondition;
    });
    if (sortBy === "price-low") return rows.sort((a,b) => a.price_mwk-b.price_mwk);
    if (sortBy === "price-high") return rows.sort((a,b) => b.price_mwk-a.price_mwk);
    if (sortBy === "name") return rows.sort((a,b) => a.title.localeCompare(b.title));
    return rows.sort((a,b) => Number(b.is_featured)-Number(a.is_featured));
  }, [products, category, query, conditionFilter, sortBy]);

  const addToCart = (id: string) => {
    const product = products.find(p => p.id === id);
    if (!product || product.demo) return;
    const currentCart = cartRef.current;
    const inCart = currentCart.filter(x => x === id).length;
    if (Number(product.stock_quantity) <= inCart) {
      Alert.alert("Stock limit reached", "There are no more units of this product available to add.");
      return;
    }
    const nextCart = [...currentCart, id];
    cartRef.current = nextCart;
    setCart(nextCart);
  };
  const toggleSaved = (id: string) =>
    setSaved(current => current.includes(id) ? current.filter(x => x !== id) : [...current, id]);
  const cartProducts = Array.from(new Set(cart)).map(id => ({ product: products.find(p => p.id === id), quantity: cart.filter(x => x === id).length })).filter((x): x is { product: Product; quantity: number } => Boolean(x.product));
  const cartTotal = cartProducts.reduce((sum, item) => sum + Number(item.product.price_mwk) * item.quantity, 0);
  const savedProducts = products.filter(p => saved.includes(p.id));

  const header = <>
    <View style={s.marketHeader}>
      <View style={s.marketHeaderTop}>
        <View style={s.brandLockup}><Image source={require("./assets/logo.png")} style={s.brandLogo} resizeMode="contain" /><View><Text style={s.marketEyebrow}>WELCOME TO</Text><Text style={s.brand}><Text style={{color:"#f36f21"}}>Malawi</Text> Market</Text></View></View>
        <Pressable style={s.headerAction} onPress={() => { setSelected(null); setTab("Cart"); }}>
          <Text style={{fontSize:23}}>🛒</Text>{cart.length > 0 ? <Text style={s.cartCount}>{cart.length}</Text> : null}
        </Pressable>
      </View>
      <View style={s.search}>
        <Text style={s.searchGlyph}>⌕</Text>
        <TextInput placeholder="Search products, brands and more" placeholderTextColor="#858b94" value={query} onChangeText={setQuery} style={s.searchInput} returnKeyType="search" onSubmitEditing={() => setTab("Search")} onFocus={() => setTab("Search")} />
        <Pressable style={s.searchAction} onPress={() => setTab("Search")}><Text style={s.searchActionText}>Search</Text></Pressable>
      </View>
      <View style={s.locationLine}><Text style={s.locationText}>⌖  Shopping across Malawi</Text><Text style={s.locationText}>Local sellers · Local deals</Text></View>
    </View>
  </>;

  const productCard = ({ item }: { item: Product }) => {
    const image = productImage(item);
    return <Pressable style={s.card} onPress={() => setSelected(item)}>
      <View style={s.imageWrap}>
        {image ? <Image source={{uri:image}} style={s.productImage} resizeMode="cover" /> :
          <View style={[s.productImage,s.imagePlaceholder]}><Text style={s.placeholderText}>No image</Text></View>}
        {item.demo ? <Text style={[s.badge,{backgroundColor:"#65758b"}]}>DEMO</Text> : item.is_featured ? <Text style={s.badge}>FEATURED</Text> : null}
        <Pressable style={s.heart} onPress={(event) => {event.stopPropagation();toggleSaved(item.id);}}>
          <Text style={{fontSize:19,color:saved.includes(item.id)?"#e34d59":"#444"}}>{saved.includes(item.id)?"♥":"♡"}</Text>
        </Pressable>
      </View>
      <View style={s.cardInfo}>
        <Text numberOfLines={2} style={s.productName}>{item.title}</Text>
        <Text style={s.price}>{money(item.price_mwk)}</Text>
        {item.compare_at_price_mwk ? <Text style={s.oldPrice}>{money(item.compare_at_price_mwk)}</Text> : null}
        <Text numberOfLines={1} style={s.seller}>{item.seller?.name ?? "Malawi Market seller"}{item.seller?.is_verified ? "  ✓" : ""}</Text>
        <Pressable disabled={item.stock_quantity<=0} style={[s.addButton,item.stock_quantity<=0&&{opacity:0.45}]} onPress={(event) => {event.stopPropagation();addToCart(item.id);}}><Text style={s.addText}>{marketText(language,item.stock_quantity>0?"Add to cart":"Out of stock")}</Text></Pressable>
      </View>
    </Pressable>;
  };

  const nav = <View style={[s.bottomNav,{bottom:0,height:isCompact?60:66,left:isTablet?18:8,right:isTablet?18:8}]}>
    {[[ "Home","⌂" ],[ "Search","⌕" ],[ "Explore","▦" ],[ "Wishlist","♡" ],[ "Cart","🛒" ],[ "Account","♙" ]].map(([name,icon]) =>
      <Pressable key={name} onPress={() => { setSelected(null); setTab(name); }} style={s.navItem}>
        <Text style={[s.navIcon,{fontSize:isCompact?20:23,color:tab===name?"#ef7b25":"#777"}]}>{icon}</Text>
        <Text numberOfLines={1} style={[s.navLabel,{fontSize:isCompact?8.5:10,color:tab===name?"#ef7b25":"#777"}]}>{marketText(language,name)}</Text>
      </Pressable>)}
  </View>;

  const emptyCatalogue = <View style={s.emptyBox}>
    <Text style={s.emptyTitle}>{loadError ? "Catalogue unavailable" : marketText(language,"No products listed yet")}</Text>
    <Text style={s.empty}>{loadError ? loadError : "Products published by Malawi Market sellers will appear here. We are not displaying sample or fake listings."}</Text>
    <Pressable style={s.outlineButton} onPress={() => void loadCatalogue(true)}><Text style={s.outlineText}>{marketText(language,"Refresh catalogue")}</Text></Pressable>
  </View>;

  return <SafeAreaView style={[s.safe,{paddingTop:Platform.OS==="android"?(StatusBar.currentHeight ?? 0):0,paddingBottom:Platform.OS==="android"?(StatusBar.currentHeight ?? 0):0}]}>
    <StatusBar translucent backgroundColor="transparent" barStyle="dark-content" />
    <View style={{width:"100%",maxWidth:contentMaxWidth,alignSelf:"center",flex:1,overflow:"hidden"}}>
    {header}
    {checkout ? <CheckoutScreen items={cartProducts.map(({product,quantity})=>({id:product.id,title:product.title,price_mwk:product.price_mwk,quantity,demo:product.demo}))} onBack={()=>setCheckout(false)} onComplete={()=>{cartRef.current=[];setCart([]);setCheckout(false);setTab("Home");}} onOrderCreated={()=>{cartRef.current=[];setCart([]);}} />
    : selected ? <ScrollView contentContainerStyle={{paddingBottom:120,paddingHorizontal:isTablet?18:0}}>
      <Pressable onPress={() => setSelected(null)} style={s.back}><Text style={s.backText}>‹  {marketText(language,"Back to shopping")}</Text></Pressable>
      {productImage(selected) ? <Image source={{uri:productImage(selected)}} style={[s.detailImage,{height:Math.min(440,Math.max(230,windowWidth*0.68))}]} resizeMode="contain" /> :
        <View style={[s.detailImage,{height:Math.min(440,Math.max(230,windowWidth*0.68))},s.imagePlaceholder]}><Text style={s.placeholderText}>No product image</Text></View>}
      <View style={{padding:18}}>
        <Text style={s.detailTitle}>{selected.title}</Text>
        <Text style={s.priceLarge}>{money(selected.price_mwk)}</Text>
        <Text style={s.seller}>{selected.seller?.name ?? "Malawi Market seller"}{selected.seller?.is_verified ? " · Verified seller" : ""}</Text>
        <Text style={s.detailMeta}>{selected.category?.name ?? "Marketplace"} · {selected.condition} · {selected.stock_quantity} available{selected.location ? " · "+selected.location : ""}</Text>
        {selected.demo ? <Text style={s.demoDetail}>DEMO LISTING — product, seller and price are illustrative only.</Text> : null}
        <Text style={s.detailDescription}>{selected.description || "No product description has been provided."}</Text>
        <ProductReviews productId={selected.id} />
        <Pressable disabled={selected.stock_quantity<=0} style={[s.primaryButton,selected.stock_quantity<=0&&{opacity:0.45}]} onPress={() => addToCart(selected.id)}><Text style={s.primaryText}>{marketText(language,selected.stock_quantity>0?"Add to cart":"Out of stock")}</Text></Pressable>
        <Pressable style={s.reportButton} onPress={() => {
          Alert.alert("Report this listing","Send a report to the Malawi Market moderation team?",[
            {text:"Cancel",style:"cancel"},
            {text:"Submit report",onPress:async()=>{
              const {data:{user}}=await supabase.auth.getUser();
              if(!user){Alert.alert("Sign in required","Sign in before reporting a listing.");return;}
              const {error}=await supabase.from("market_reports").insert({reporter_user_id:user.id,target_type:"product",target_id:selected.id,reason:"Suspicious or misleading listing"});
              if(error)Alert.alert("Report failed",error.message);else Alert.alert("Report submitted","The moderation team will review this listing.");
            }}
          ]);
        }}><Text style={s.reportText}>Report this listing</Text></Pressable>
      </View>
    </ScrollView>
    : tab === "Home" || tab === "Search" ? <ScrollView contentContainerStyle={{paddingBottom:100}} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadCatalogue(true)} />}>
      
      {tab === "Home" ? <>
        <View style={s.promoBanner}>
          <View style={s.promoCopy}>
            <Text style={s.promoKicker}>MALAWI'S MARKETPLACE</Text>
            <Text style={s.promoTitle}>Discover more. Shop better.</Text>
            <Text style={s.promoSub}>A better way to find great products from sellers across Malawi.</Text>
            <Pressable style={s.promoButton} onPress={() => setTab("Search")}><Text style={s.promoButtonText}>Explore marketplace  ›</Text></Pressable>
          </View>
        </View>
        <View style={s.shortcutRow}>
          {[["▦","All categories",()=>{setCategory("all");setTab("Search");}],["✦","Featured",()=>{setSortBy("relevance");setTab("Search");}],["♡","Wishlist",()=>setTab("Wishlist")],["▣","My cart",()=>setTab("Cart")]].map(([icon,label,action])=><Pressable key={String(label)} style={s.shortcut} onPress={action as ()=>void}><View style={s.shortcutIcon}><Text style={s.shortcutGlyph}>{icon}</Text></View><Text style={s.shortcutLabel}>{label}</Text></Pressable>)}
        </View>
      </> : null}
      <View style={s.sectionHead}><Text style={s.sectionTitle}>Shop by category</Text><Pressable onPress={()=>setTab("Search")}><Text style={s.viewAll}>See all  ›</Text></Pressable></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.categoryRow}>
        {[{id:"all",name:"All products",slug:"all",icon:"✦"},...categories].map(c =>
          <Pressable key={c.id} onPress={() => {setCategory(c.slug);setTab("Search");}} style={[s.categoryTile,category===c.slug&&s.categoryTileActive]}>
            <View style={[s.categoryIcon,category===c.slug&&s.categoryIconActive]}><Text style={[s.categoryIconText,category===c.slug&&s.categoryIconTextActive]}>{c.icon || (c.name==="All products"?"✦":c.name.slice(0,1).toUpperCase())}</Text></View>
            <Text numberOfLines={2} style={[s.categoryText,category===c.slug&&s.categoryTextActive]}>{c.name}</Text>
          </Pressable>)}
      </ScrollView>
      {tab === "Home" && products.some(p=>p.is_featured) ? <>
        <View style={s.sectionHead}><View><Text style={s.sectionTitle}>Featured finds</Text><Text style={s.sectionHint}>Selected products from Malawi Market sellers</Text></View><Text style={s.viewAll}>{products.filter(p=>p.is_featured).length} items</Text></View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.featuredRow}>
          {products.filter(p=>p.is_featured).slice(0,8).map(p=><Pressable key={p.id} style={s.featuredCard} onPress={()=>setSelected(p)}>
            {productImage(p)?<Image source={{uri:productImage(p)}} style={s.featuredImage} resizeMode="cover"/>:<View style={[s.featuredImage,s.imagePlaceholder]}><Text style={s.placeholderText}>No image</Text></View>}
            <Text numberOfLines={2} style={s.featuredName}>{p.title}</Text><Text style={s.featuredPrice}>{money(p.price_mwk)}</Text>
            {p.seller?.is_verified?<Text style={s.featuredSeller}>✓ Verified seller</Text>:null}
          </Pressable>)}
        </ScrollView>
      </> : null}
      <View style={s.sectionHead}><Text style={s.sectionTitle}>{marketText(language,tab === "Search" ? "Find products" : query ? "Search results" : "Recommended for you")}</Text><Text style={s.viewAll}>{filtered.length} items</Text></View>
      {tab === "Search" ? <View style={s.filterPanel}>
        <Text style={s.filterHeading}>Sort by</Text>
        <View style={s.filterRow}>{[["relevance","Featured"],["price-low","Price ↑"],["price-high","Price ↓"],["name","Name"]].map(([v,label])=><Pressable key={v} onPress={()=>setSortBy(v)} style={[s.filterPill,sortBy===v&&s.filterActive]}><Text style={[s.filterText,sortBy===v&&{color:"#fff"}]}>{label}</Text></Pressable>)}</View>
        <Text style={s.filterHeading}>Condition</Text>
        <View style={s.filterRow}>{[["all","Any"],["new","New"],["used","Used"],["refurbished","Refurbished"]].map(([v,label])=><Pressable key={v} onPress={()=>setConditionFilter(v)} style={[s.filterPill,conditionFilter===v&&s.filterActive]}><Text style={[s.filterText,conditionFilter===v&&{color:"#fff"}]}>{label}</Text></Pressable>)}</View>
      </View> : null}
      {loading ? <View style={s.loading}><ActivityIndicator size="large" color="#ef7b25"/><Text style={s.loadingText}>Loading marketplace…</Text></View>
        : filtered.length ? <FlatList data={filtered} renderItem={productCard} keyExtractor={p=>p.id} numColumns={gridColumns} scrollEnabled={false} columnWrapperStyle={[s.productRow,{gap:horizontalGutter}]} contentContainerStyle={{paddingHorizontal:horizontalGutter}} />
        : emptyCatalogue}
      <View style={s.trust}><Text style={s.trustTitle}>Made for Malawi</Text><Text style={s.trustText}>Discover products, support local sellers and shop from one place.</Text></View>
    </ScrollView>
    : tab === "Cart" ? <ScrollView contentContainerStyle={s.page}>
      <Text style={s.pageTitle}>{marketText(language,"Your cart")}</Text>
      {cartProducts.length === 0 ? <Text style={s.empty}>Your cart is empty. Explore products and add something you like.</Text> :
        <>{cartProducts.map(({product:p,quantity},index) => <View key={p.id} style={s.cartRow}>
          {productImage(p) ? <Image source={{uri:productImage(p)}} style={s.cartImage}/> : <View style={[s.cartImage,s.imagePlaceholder]}/>}
          <View style={{flex:1}}><Text style={s.productName}>{p.title}</Text><Text style={s.price}>{money(p.price_mwk)}</Text><Text style={s.seller}>Quantity: {quantity}</Text>
            <View style={{flexDirection:"row",alignItems:"center",gap:12,marginTop:7}}>
              <Pressable onPress={()=>setCart(v=>{const i=v.indexOf(p.id);if(i<0)return v;const copy=[...v];copy.splice(i,1);return copy;})} style={s.qtyButton}><Text style={s.qtyText}>−</Text></Pressable>
              <Text style={s.qtyText}>{quantity}</Text>
              <Pressable onPress={()=>addToCart(p.id)} style={s.qtyButton}><Text style={s.qtyText}>+</Text></Pressable>
            </View>
          </View>
          <Pressable onPress={() => setCart(v => v.filter(id=>id!==p.id))}><Text style={{color:"#c44",padding:8}}>Remove</Text></Pressable>
        </View>)}
        <Text style={s.total}>Subtotal: {money(cartTotal)}</Text>
        <Pressable style={s.primaryButton} onPress={()=>setCheckout(true)}><Text style={s.primaryText}>{marketText(language,"Proceed to secure checkout")}</Text></Pressable>
        <Text style={s.detailDescription}>Checkout uses OneKhusa. Payment is only confirmed after a verified provider notification.</Text>
        </>}
    </ScrollView>
    : tab === "Wishlist" ? <ScrollView contentContainerStyle={s.page}>
      <Text style={s.pageTitle}>{marketText(language,"Wishlist")}</Text>
      {savedProducts.length ? <FlatList data={savedProducts} renderItem={productCard} keyExtractor={p=>p.id} numColumns={gridColumns} scrollEnabled={false} columnWrapperStyle={[s.productRow,{gap:horizontalGutter}]} contentContainerStyle={{paddingHorizontal:horizontalGutter}}/> :
        <Text style={s.empty}>Products you save will appear here.</Text>}
    </ScrollView>
    : tab === "Explore" ? <ExploreScreens language={language} /> : <AccountScreens language={language} onLanguageChange={setLanguage} passwordRecovery={passwordRecovery} onPasswordRecoveryComplete={()=>setPasswordRecovery(false)} />}
    {nav}
    </View>
  </SafeAreaView>;
}


const s = StyleSheet.create({
 safe:{flex:1,backgroundColor:"#f6f7f9"},topStrip:{backgroundColor:"#172b4d",paddingVertical:6,alignItems:"center"},stripText:{color:"#fff",fontSize:9,fontWeight:"800",letterSpacing:1},
 header:{height:62,paddingHorizontal:18,flexDirection:"row",alignItems:"center",justifyContent:"space-between",backgroundColor:"#fff"},brand:{fontSize:23,fontWeight:"900",color:"#172b4d",letterSpacing:-.8},tagline:{fontSize:11,color:"#737d8c",marginTop:0},
 cartIcon:{padding:10},cartCount:{position:"absolute",right:0,top:0,backgroundColor:"#ef7b25",color:"#fff",fontSize:10,fontWeight:"bold",borderRadius:10,minWidth:18,textAlign:"center",overflow:"hidden"},
 search:{height:54,borderRadius:13,backgroundColor:"#f7f8fa",borderWidth:1,borderColor:"#e4e8ee",paddingLeft:15,paddingRight:5,flexDirection:"row",alignItems:"center",gap:10,marginTop:12},searchInput:{flex:1,fontSize:14,color:"#172b4d",paddingVertical:0},
 hero:{backgroundColor:"#172b4d",marginHorizontal:14,marginTop:4,borderRadius:15,padding:19,overflow:"hidden"},heroTop:{flexDirection:"row",alignItems:"center",justifyContent:"space-between"},heroKicker:{color:"#ffbd82",fontSize:10,fontWeight:"900",letterSpacing:1.1},heroTag:{color:"#fff",fontSize:10,fontWeight:"900",letterSpacing:2,borderWidth:1,borderColor:"#64748b",borderRadius:5,paddingHorizontal:8,paddingVertical:5},heroTitle:{color:"#fff",fontSize:24,lineHeight:30,fontWeight:"900",marginTop:11},heroSub:{color:"#d8dfeb",fontSize:13,marginTop:7,lineHeight:19},heroButton:{backgroundColor:"#ef7b25",alignSelf:"flex-start",paddingHorizontal:16,paddingVertical:12,borderRadius:8,marginTop:14},heroButtonText:{color:"#fff",fontWeight:"900",fontSize:13},
 sectionHead:{paddingHorizontal:17,marginTop:23,marginBottom:12,flexDirection:"row",alignItems:"center",justifyContent:"space-between"},sectionTitle:{fontSize:19,fontWeight:"900",color:"#172b4d",letterSpacing:-.35},viewAll:{fontSize:12,color:"#e76f18",fontWeight:"800"},
 categoryRow:{paddingHorizontal:16,gap:11},categoryTile:{width:82,minHeight:102,backgroundColor:"#fff",borderRadius:14,padding:9,alignItems:"center",justifyContent:"center",gap:8,borderWidth:1,borderColor:"#edf0f3"},categoryTileActive:{borderColor:"#ef7628",backgroundColor:"#fff8f2"},categoryIcon:{width:48,height:48,borderRadius:15,backgroundColor:"#fff2e9",alignItems:"center",justifyContent:"center",elevation:0,shadowColor:"#172b4d",shadowOpacity:0,shadowRadius:0,shadowOffset:{width:0,height:0}},categoryIconActive:{backgroundColor:"#ef7628"},categoryIconText:{fontSize:20,fontWeight:"900",color:"#e87520"},categoryIconTextActive:{color:"#fff"},categoryText:{fontSize:10.5,lineHeight:14,fontWeight:"700",color:"#5c6675",textAlign:"center"},categoryTextActive:{color:"#d96612"},
 productRow:{gap:12,marginBottom:14},card:{flex:1,backgroundColor:"#fff",borderWidth:1,borderColor:"#edf0f3",borderRadius:13,overflow:"hidden",elevation:1,shadowColor:"#182b45",shadowOpacity:0.035,shadowRadius:5,shadowOffset:{width:0,height:2}},imageWrap:{position:"relative"},productImage:{width:"100%",aspectRatio:1,backgroundColor:"#f0f2f5"},imagePlaceholder:{alignItems:"center",justifyContent:"center"},placeholderText:{fontSize:12,color:"#8a93a2"},badge:{position:"absolute",left:9,top:9,backgroundColor:"#ef7b25",color:"#fff",fontSize:10,fontWeight:"900",paddingHorizontal:8,paddingVertical:5,borderRadius:5,overflow:"hidden"},heart:{position:"absolute",right:8,top:8,backgroundColor:"#fff",width:36,height:36,borderRadius:18,alignItems:"center",justifyContent:"center",elevation:2},
 cardInfo:{padding:12},productName:{fontSize:13,fontWeight:"700",color:"#202b3c",lineHeight:18,minHeight:36},price:{fontSize:18,fontWeight:"900",color:"#e96f24",marginTop:7,letterSpacing:-.35},oldPrice:{fontSize:11,color:"#9299a4",textDecorationLine:"line-through"},seller:{fontSize:10,color:"#8792a1",marginTop:7},addButton:{backgroundColor:"#ef7628",borderRadius:9,alignItems:"center",justifyContent:"center",paddingVertical:11,marginTop:12,minHeight:42},addText:{color:"#fff",fontWeight:"900",fontSize:12,letterSpacing:.2},
 bottomNav:{position:"absolute",bottom:8,left:8,right:8,height:66,borderTopWidth:1,borderTopColor:"#edf0f3",backgroundColor:"#fff",flexDirection:"row",justifyContent:"space-around",alignItems:"center",paddingBottom:2,borderRadius:17,elevation:10,shadowColor:"#10213a",shadowOpacity:0.10,shadowRadius:14,shadowOffset:{width:0,height:5}},navItem:{alignItems:"center",justifyContent:"center",flex:1,minHeight:54},navIcon:{fontSize:24},navLabel:{fontSize:10.5,fontWeight:"800",marginTop:4},
 demoNotice:{marginHorizontal:14,marginTop:8,padding:10,borderRadius:8,backgroundColor:"#fff4e9"},demoNoticeText:{fontSize:10,color:"#8b4c18",fontWeight:"700",lineHeight:15},demoDetail:{fontSize:11,color:"#9a5b20",fontWeight:"800",marginTop:10},trust:{margin:15,padding:18,backgroundColor:"#fff",borderWidth:1,borderColor:"#e9ebef",borderRadius:12},trustTitle:{fontWeight:"900",fontSize:16,color:"#172b4d"},trustText:{fontSize:13,color:"#667085",marginTop:5,lineHeight:19},
 filterPanel:{marginHorizontal:14,marginTop:4,padding:16,backgroundColor:"#fff",borderWidth:1,borderColor:"#e9ebef",borderRadius:13},filterHeading:{fontSize:13,fontWeight:"900",color:"#536073",marginTop:5,marginBottom:8},filterRow:{flexDirection:"row",flexWrap:"wrap",gap:7,marginBottom:10},filterPill:{borderWidth:1,borderColor:"#dfe4ea",borderRadius:18,paddingHorizontal:13,paddingVertical:10,backgroundColor:"#fff"},filterActive:{backgroundColor:"#172b4d",borderColor:"#172b4d"},filterText:{fontSize:12,color:"#536073",fontWeight:"800"},page:{padding:18,paddingBottom:130},pageTitle:{fontSize:26,fontWeight:"900",color:"#172b4d",marginBottom:16},empty:{color:"#777",fontSize:15,lineHeight:23,paddingVertical:25,textAlign:"center"},emptyBox:{marginHorizontal:16,marginTop:22,padding:22,backgroundColor:"#fff",borderRadius:13,alignItems:"center"},emptyTitle:{fontSize:18,fontWeight:"900",color:"#172b4d"},outlineButton:{marginTop:12,borderWidth:1,borderColor:"#ef7b25",paddingHorizontal:16,paddingVertical:11,borderRadius:8},outlineText:{fontSize:13,color:"#df6c19",fontWeight:"900"},loading:{padding:35,alignItems:"center",gap:10},loadingText:{fontSize:13,color:"#777"},
 cartRow:{flexDirection:"row",alignItems:"center",gap:10,borderBottomWidth:1,borderColor:"#eee",paddingVertical:12},cartImage:{width:72,height:72,borderRadius:9,backgroundColor:"#f2f3f5"},qtyButton:{width:32,height:32,borderRadius:8,backgroundColor:"#fff1e5",alignItems:"center",justifyContent:"center"},qtyText:{fontSize:14,fontWeight:"900",color:"#172b4d"},total:{fontSize:18,fontWeight:"900",color:"#172b4d",marginTop:20,textAlign:"right"},
 back:{padding:16},backText:{color:"#ef7b25",fontWeight:"900"},detailImage:{width:"100%",height:320,backgroundColor:"#f4f4f4"},detailTitle:{fontSize:24,fontWeight:"900",color:"#172b4d"},priceLarge:{fontSize:27,fontWeight:"900",color:"#ef7b25",marginTop:12},detailMeta:{fontSize:12,color:"#7a8492",marginTop:9},detailDescription:{fontSize:14,color:"#667085",lineHeight:22,marginTop:18},primaryButton:{backgroundColor:"#ef7b25",padding:17,borderRadius:10,alignItems:"center",marginTop:20,minHeight:52,justifyContent:"center"},primaryText:{color:"#fff",fontWeight:"900",fontSize:14},reportButton:{alignItems:"center",padding:14,marginTop:8},reportText:{color:"#a33",fontWeight:"800",fontSize:12},
 marketHeader:{backgroundColor:"#fff",paddingHorizontal:18,paddingTop:10,paddingBottom:12,borderBottomWidth:0},marketHeaderTop:{height:52,flexDirection:"row",alignItems:"center",justifyContent:"space-between"},marketEyebrow:{fontSize:9,fontWeight:"900",letterSpacing:1.5,color:"#8792a3",marginBottom:2},headerAction:{width:46,height:46,borderRadius:16,backgroundColor:"#f3f5f8",alignItems:"center",justifyContent:"center"},searchGlyph:{fontSize:22,color:"#666",width:22,textAlign:"center"},searchAction:{backgroundColor:"#ef7628",paddingHorizontal:16,paddingVertical:11,borderRadius:11},searchActionText:{color:"#fff",fontSize:13,fontWeight:"900"},locationLine:{flexDirection:"row",justifyContent:"space-between",marginTop:10,paddingHorizontal:2},locationText:{fontSize:10,color:"#8490a0",fontWeight:"700"},promoBanner:{marginHorizontal:16,marginTop:14,minHeight:190,borderRadius:17,backgroundColor:"#142844",padding:22,flexDirection:"row",overflow:"hidden",justifyContent:"space-between",alignItems:"center",elevation:2,shadowColor:"#10213a",shadowOpacity:0.10,shadowRadius:10,shadowOffset:{width:0,height:4}},promoCopy:{flex:1,paddingRight:3,zIndex:2},heroOrbLarge:{position:"absolute",width:230,height:230,borderRadius:115,right:-65,top:-95,backgroundColor:"#1e3a5d",borderWidth:1,borderColor:"#345274"},heroOrbSmall:{position:"absolute",width:145,height:145,borderRadius:73,right:12,bottom:-92,backgroundColor:"#1b3454",borderWidth:1,borderColor:"#345274"},promoKicker:{fontSize:9,color:"#ffb77f",fontWeight:"900",letterSpacing:1.7},promoTitle:{fontSize:28,lineHeight:33,fontWeight:"900",color:"#fff",marginTop:10,maxWidth:280,letterSpacing:-.8},promoSub:{fontSize:13,lineHeight:20,color:"#d6e0ed",marginTop:8,maxWidth:270},promoButton:{alignSelf:"flex-start",backgroundColor:"#f0782b",paddingHorizontal:15,paddingVertical:12,borderRadius:11,marginTop:16,elevation:2},promoButtonText:{color:"#fff",fontSize:12,fontWeight:"900",letterSpacing:.1},shortcutRow:{flexDirection:"row",justifyContent:"space-around",backgroundColor:"#fff",marginTop:14,paddingVertical:15,borderRadius:15,marginHorizontal:16,borderWidth:1,borderColor:"#edf0f3",elevation:0,shadowColor:"#182b45",shadowOpacity:0,shadowRadius:0,shadowOffset:{width:0,height:0}},shortcut:{alignItems:"center",flex:1},shortcutIcon:{width:45,height:45,borderRadius:14,backgroundColor:"#fff2e9",alignItems:"center",justifyContent:"center"},shortcutGlyph:{fontSize:23,color:"#ed6b1b",fontWeight:"800"},shortcutLabel:{fontSize:11,color:"#3c424a",fontWeight:"700",marginTop:6},sectionHint:{fontSize:11,color:"#858b94",marginTop:3},featuredRow:{paddingHorizontal:12,gap:10},featuredCard:{width:158,backgroundColor:"#fff",borderRadius:15,padding:9,borderWidth:0,borderColor:"transparent",elevation:3,shadowColor:"#172b4d",shadowOpacity:0.06,shadowRadius:10,shadowOffset:{width:0,height:4}},featuredImage:{width:"100%",height:138,backgroundColor:"#eef1f5",borderRadius:10},featuredName:{fontSize:12,color:"#343a42",fontWeight:"700",lineHeight:16,marginTop:8,minHeight:32},featuredPrice:{fontSize:15,color:"#222831",fontWeight:"900",marginTop:5},featuredSeller:{fontSize:9,color:"#23865a",fontWeight:"700",marginTop:3},
 brandLockup:{flexDirection:"row",alignItems:"center",gap:9},brandLogo:{width:49,height:49,borderRadius:12},
});
