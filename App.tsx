import React, { useEffect, useMemo, useRef, useState , from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  SafeAreaView, ScrollView, View, Text, TextInput, Image, Pressable, Linking, Alert, BackHandler,
  StatusBar, StyleSheet, FlatList, ActivityIndicator, RefreshControl, Platform, useWindowDimensions
, from "react-native";
import { supabase } from "./src/lib/supabase";
import { processAuthCallback } from "./src/lib/auth-callback";
import { ExploreScreens } from "./src/screens/ExploreScreens";
import { AccountScreens } from "./src/screens/AccountScreens";
import { ProductReviews } from "./src/components/ProductReviews";
import { CheckoutScreen } from "./src/screens/CheckoutScreen";
import { QRToolsScreen } from "./src/screens/QRToolsScreen";
import { marketText, MarketLanguage } from "./src/lib/i18n";
import { MarketIcon } from "./src/components/MarketIcon";

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
type AdCampaign={id:string;business_name:string;title:string;body:string;destination_url:string;image_url:string;placement:"homepage"|"search"|"feed"|"business"};
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
  const [appearance,setAppearance]=useState<{theme:"light"|"dark";accentColor:string}>({theme:"light",accentColor:"#3B82F6"});
  const darkMode=appearance.theme==="dark";
  const palette={background:darkMode?"#111318":"#ffffff",surface:darkMode?"#1b1f27":"#ffffff",text:darkMode?"#f3f4f6":"#202124",muted:darkMode?"#aab2bf":"#4b5563",border:darkMode?"#343b47":"#d9dde3",accent:appearance.accentColor};

  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [checkout, setCheckout] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [sortBy, setSortBy] = useState("relevance");
  const [conditionFilter, setConditionFilter] = useState("all");
  const [cart, setCart] = useState<string[]>([]);
  const cartRef = useRef<string[]>([]);
  const updateCart = (update: string[] | ((current: string[]) => string[])) => {
    const next = typeof update === "function" ? update(cartRef.current) : update;
    cartRef.current = next;
    setCart(next);
  };
  const [saved, setSaved] = useState<string[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [adCampaigns,setAdCampaigns]=useState<AdCampaign[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selected, setSelected] = useState<Product | null>(null);
  const [qrProduct, setQrProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [storageReady, setStorageReady] = useState(false);
  const [splashVisible, setSplashVisible] = useState(true);
  const [homeName, setHomeName] = useState("there");
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  useEffect(() => {
    let active=true;
    AsyncStorage.getItem("@malawi-market/profile").then(raw=>{
      if(!active||!raw)return;
      try{const saved=JSON.parse(raw);const theme=saved.theme==="dark"?"dark":"light";const accentColor=/^#[0-9a-fA-F]{6}$/.test(saved.accentColor)?saved.accentColor:"#3B82F6";setAppearance({theme,accentColor});}catch{}
    }).catch(()=>{});
    return()=>{active=false;};
  }, []);
  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (selected) {
        setSelected(null);
        return true;
      }
      if (checkout) {
        setCheckout(false);
        return true;
      }
      if (tab === "Explore" || tab === "Account") return false;
      if (tab !== "Home") {
        setTab("Home");
        setQrProduct(null);
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, [tab, selected, checkout]);

  useEffect(() => {
    let active = true;
    const loadHomeIdentity = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        if (active) { setHomeName("there"); setUnreadNotifications(0); }
        return;
      }
      const [profileResult, notificationResult] = await Promise.all([
        supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
        supabase.from("market_notifications").select("id", { count: "exact", head: true })
          .eq("user_id", user.id).is("read_at", null),
      ]);
      if (!active) return;
      const metadataName = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0];
      setHomeName(profileResult.data?.display_name?.trim() || metadataName || "there");
      setUnreadNotifications(notificationResult.count ?? 0);
    };
    void loadHomeIdentity();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      void loadHomeIdentity();
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

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
      const now=new Date().toISOString();
      const adResult=await supabase.from("market_ad_campaigns")
        .select("id,business_name,title,body,destination_url,image_url,placement")
        .eq("status","active").eq("payment_status","paid")
        .or("starts_at.is.null,starts_at.lte."+now)
        .or("ends_at.is.null,ends_at.gt."+now)
        .order("created_at",{ascending:false}).limit(20);
      setAdCampaigns((adResult.data??[]) as AdCampaign[]);
      const mergedCategories = new Map<string, Category>();
      ((categoryResult.data ?? []) as Category[]).forEach(item => mergedCategories.set(item.slug, item));
      setCategories(Array.from(mergedCategories.values()));
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
    for (const ad of adCampaigns) {
      void supabase.functions.invoke("onekhusa-payments", { body: { action: "track_ad_event", campaign_id: ad.id, event_type: "impression" } });
    }
  }, [adCampaigns]);

  useEffect(() => {
    const splashTimer = setTimeout(() => setSplashVisible(false), 950);
    return () => clearTimeout(splashTimer);
  }, []);
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
      if (!url || !url.startsWith("mw.wealthgrid.malawimarket://auth/")) return;
      try {
        const result = await processAuthCallback(url);
        if (result === "recovery") setPasswordRecovery(true);
        if (result === "recovery" || result === "google") setTab("Account");
      } catch (error) {
        console.warn("Authentication callback could not be processed", error);
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
      try { if (c) { const restoredCart=JSON.parse(c); if(Array.isArray(restoredCart)){updateCart(restoredCart);} } } catch {}
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
    if (!product) return;
    const currentCart = cartRef.current;
    const inCart = currentCart.filter(x => x === id).length;
    if (Number(product.stock_quantity) <= inCart) {
      Alert.alert("Stock limit reached", "There are no more units of this product available to add.");
      return;
    }
    const nextCart = [...currentCart, id];
    updateCart(nextCart);
  };
  const toggleSaved = (id: string) =>
    setSaved(current => current.includes(id) ? current.filter(x => x !== id) : [...current, id]);
  const handleQrScan = (rawValue: string) => {
    const match = rawValue.trim().match(/^mw\.wealthgrid\.malawimarket:\/\/product\/([A-Za-z0-9-]+)$/i);
    if (!match) {
      Alert.alert("Unsupported QR code", "This code is not a Malawi Market product QR code.");
      return;
    }
    const product = products.find(item => item.id === match[1] && !item.demo);
    if (!product) {
      Alert.alert("Product unavailable", "This product is not currently available in the loaded marketplace catalogue.");
      return;
    }
    setSelected(product);
    setTab("Home");
  };
  const cartProducts = Array.from(new Set(cart)).map(id => ({ product: products.find(p => p.id === id), quantity: cart.filter(x => x === id).length })).filter((x): x is { product: Product; quantity: number } => Boolean(x.product));
  const cartTotal = cartProducts.reduce((sum, item) => sum + Number(item.product.price_mwk) * item.quantity, 0);
  const savedProducts = products.filter(p => saved.includes(p.id));
  const shortcuts: [string, string, () => void][] = [
    ["categories", "All categories", () => { setCategory("all"); setTab("Search"); }],
    ["featured", "Featured", () => { setSortBy("relevance"); setTab("Search"); }],
    ["wishlist", "Wishlist", () => setTab("Wishlist")],
    ["cart", "My cart", () => setTab("Cart")],
    ["qr", "QR codes", () => { setQrProduct(null); setTab("QR"); }],
  ];

  const productCard = ({ item }: { item: Product }) => {
    const image = productImage(item);
    return <Pressable style={s.card} onPress={() => setSelected(item)}>
      <View style={s.imageWrap}>
        {image ? <Image source={{uri:image}} style={s.productImage} resizeMode="cover" /> :
          <View style={[s.productImage,s.imagePlaceholder]}><Text style={s.placeholderText}>No image</Text></View>}
        {item.demo ? <Text style={[s.badge,{backgroundColor:"#65758b"}]}>DEMO</Text> : item.is_featured ? <Text style={s.badge}>FEATURED</Text> : null}
        <Pressable style={s.heart} onPress={(event) => {event.stopPropagation();toggleSaved(item.id);}}>
          <MarketIcon name="wishlist" size={19} color={saved.includes(item.id)?"#e34d59":"#444"} filled={saved.includes(item.id)} />
        </Pressable>
      </View>
      <View style={s.cardInfo}>
        <Text numberOfLines={2} style={s.productName}>{item.title}</Text>
        <Text style={s.price}>{money(item.price_mwk)}</Text>
        {item.compare_at_price_mwk ? <Text style={s.oldPrice}>{money(item.compare_at_price_mwk)}</Text> : null}
        <Text numberOfLines={1} style={s.seller}>{item.seller?.name ?? "Malawi Market seller"}{item.seller?.is_verified ? "  ✓" : ""}</Text>
        <Pressable disabled={item.stock_quantity<=0} style={[s.addButton,item.stock_quantity<=0&&{opacity:1,backgroundColor:"#858b94"}]} onPress={(event) => {event.stopPropagation();addToCart(item.id);}}><Text style={s.addText}>{marketText(language,item.stock_quantity>0?"Add to cart":"Out of stock")}</Text></Pressable>
      </View>
    </Pressable>;
  };

  const adPlacement=(placement:"homepage"|"search"|"feed"|"business")=>adCampaigns.filter(ad=>ad.placement===placement).slice(0,2).map(ad=><Pressable key={ad.id} accessibilityRole="link" accessibilityLabel={"Sponsored: "+ad.title} style={s.adCard} onPress={()=>{void supabase.functions.invoke("onekhusa-payments",{body:{action:"track_ad_event",campaign_id:ad.id,event_type:"click"}});void Linking.openURL(ad.destination_url).catch(()=>Alert.alert("Unable to open advertisement","Check your internet connection and try again."));}}><Image source={{uri:ad.image_url}} style={s.adImage} resizeMode="cover"/><View style={s.adCopy}><Text style={s.adLabel}>SPONSORED · {ad.business_name}</Text><Text numberOfLines={2} style={s.adTitle}>{ad.title}</Text><Text numberOfLines={2} style={s.adBody}>{ad.body}</Text><Text style={s.adLink}>Learn more ›</Text></View></Pressable>);
  const nav = <View style={[s.bottomNav,{bottom:Platform.OS==="android"?32:8,height:isCompact?60:66,left:isTablet?18:8:right:isTablet?18:8,backgroundColor:palette.surface,borderTopColor:palette.border}]}>
    {[
      ["Home","Home","home"],
      ["Explore","Explore","explore"],
      ["Search","Shop","search"],
      ["Wishlist","Wishlist","wishlist"],
      ["Account","My Account","account"],
    ].map(([tabName,label,icon]) =>
      <Pressable key={tabName} accessibilityRole="button" accessibilityState={{selected:tab===tabName}} onPress={() => { setSelected(null); setTab(tabName); }} style={[s.navItem,{backgroundColor:"transparent"}]}>
        <MarketIcon name={icon} size={isCompact?20:22} color={tab===tabName?palette.accent:palette.muted} />
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={[s.navLabel,{color:tab===tabName?palette.accent:palette.muted,fontSize:isCompact?8.5:10,color:tab===tabName?"#ef7b25":"#777"}]}>{marketText(language,label)}</Text>
      </Pressable>)}
  </View>;

  const emptyCatalogue = <View style={s.emptyBox}>
    <Text style={s.emptyTitle}>{loadError ? "Catalogue unavailable" : marketText(language,"No products listed yet")}</Text>
    <Text style={s.empty}>{loadError ? loadError : "Products published by Malawi Market sellers will appear here. We are not displaying sample or fake listings."}</Text>
    <Pressable style={s.outlineButton} onPress={() => void loadCatalogue(true)}><Text style={s.outlineText}>{marketText(language,"Refresh catalogue")}</Text></Pressable>
  </View>;

  return <SafeAreaView style={[s.safe,{backgroundColor:palette.background,paddingTop:Platform.OS==="android"?(StatusBar.currentHeight ?? 0):0}]}>
    <StatusBar translucent backgroundColor="transparent" barStyle={darkMode?"light-content":"dark-content"} />
    <View style={{width:"100%",maxWidth:contentMaxWidth,alignSelf:"center",flex:1,overflow:"hidden",backgroundColor:palette.background}}>
    {checkout ? <CheckoutScreen items={cartProducts.map(({product,quantity})=>({id:product.id,title:product.title,price_mwk:product.price_mwk,quantity,demo:product.demo}))} onBack={()=>setCheckout(false)} onComplete={()=>{updateCart([]);setCheckout(false);setTab("Home");}} onOrderCreated={()=>{updateCart([]);}} />
    : selected ? <ScrollView contentContainerStyle={{paddingBottom:120,paddingHorizontal:isTablet?18:0}}>
      <Pressable onPress={() => setSelected(null)} style={s.back}><Text style={s.backText}>‹  {marketText(language,"Back to shopping")}</Text></Pressable>
      {productImage(selected) ? <Image source={{uri:productImage(selected)}} style={[s.detailImage,{height:Math.min(440,Math.max(230,windowWidth*0.68))}]} resizeMode="cover" /> :
        <View style={[s.detailImage,{height:Math.min(440,Math.max(230,windowWidth*0.68))},s.imagePlaceholder]}><Text style={s.placeholderText}>No product image</Text></View>}
      <View style={{padding:18}}>
        <Text style={[s.detailTitle,{color:palette.text}]}>{selected.title}</Text>
        <Text style={[s.priceLarge,{color:palette.accent}]}>{money(selected.price_mwk)}</Text>
        <Text style={s.seller}>{selected.seller?.name ?? "Malawi Market seller"}{selected.seller?.is_verified ? " · Verified seller" : ""}</Text>
        <Text style={s.detailMeta}>{selected.category?.name ?? "Marketplace"} · {selected.condition} · {selected.stock_quantity} available{selected.location ? " · "+selected.location : ""}</Text>
        {selected.demo ? <Text style={s.demoDetail}>DEMO LISTING — product, seller and price are illustrative only.</Text> : null}
        <Text style={s.detailDescription}>{selected.description || "No product description has been provided."}</Text>
        <ProductReviews productId={selected.id} />
        <Pressable style={[s.primaryButton,{backgroundColor:"#202124"}]} onPress={() => { setSelected(null); setQrProduct(selected); setTab("QR"); }}><Text style={s.primaryText}>Show product QR code</Text></Pressable>
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
    : tab === "Home" || tab === "Search" ? <ScrollView contentContainerStyle={{paddingBottom:132}} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadCatalogue(true)} />}>
      
      {tab === "Home" ? <>
        <View style={[s.homeTop,{backgroundColor:darkMode?"#191d25":"#fffaf5"}]}>
          <View style={s.homeBrandRow}>
            <Image source={require("./assets/logo.png")} style={s.homeLogo} resizeMode="contain" />
            <View style={s.homeActions}>
              <Pressable accessibilityRole="button" accessibilityLabel={unreadNotifications ? `${unreadNotifications} unread notifications` : "Notifications"} onPress={() => setTab("Account")} style={s.homeAction}>
                <MarketIcon name="notifications" size={25} color="#34241b" />
                {unreadNotifications > 0 ? <View style={s.notificationDot} /> : null}
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Open profile" onPress={() => setTab("Account")} style={[s.homeAction,s.homeAvatar]}>
                <MarketIcon name="account" size={25} color="#34241b" />
              </Pressable>
            </View>
          </View>
          <Text numberOfLines={1} style={s.homeGreeting}>Hello, {homeName} 👋</Text>
          <Text style={s.homeWelcome}>What would you like to shop today?</Text>
          <View style={s.homeSearch}>
            <MarketIcon name="search" size={21} color="#858585" />
            <TextInput
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={() => setTab("Search")}
              returnKeyType="search"
              placeholder="Search for products, essentials..."
              placeholderTextColor="#858585"
              style={s.homeSearchInput}
            />
            <Pressable accessibilityRole="button" accessibilityLabel="Browse categories and filters" onPress={() => setTab("Search")} style={s.homeFilter}>
              <MarketIcon name="categories" size={21} color="#34241b" />
            </Pressable>
          </View>
        </View>
        <View style={s.promoBanner}>
          <View style={s.promoCopy}>
            <Text style={s.promoKicker}>MALAWI'S MARKETPLACE</Text>
            <Text style={s.promoTitle}>Discover more. Shop better.</Text>
            <Text style={s.promoSub}>A better way to find great products from sellers across Malawi.</Text>
            <Pressable style={s.promoButton} onPress={() => setTab("Search")}><Text style={s.promoButtonText}>Explore marketplace  ›</Text></Pressable>
          </View>
        </View>
        {adPlacement("homepage")}
        <View style={s.shortcutRow}>
          {shortcuts.map(([icon,label,action])=><Pressable key={label} style={s.shortcut} onPress={action}><View style={s.shortcutIcon}><MarketIcon name={icon} size={21} color="#e87520" /></View><Text style={s.shortcutLabel}>{label}</Text></Pressable>)}
        </View>
      </> : null}
      <View style={s.sectionHead}><Text style={[s.sectionTitle,{color:palette.text}]}>Shop by category</Text><Pressable onPress={()=>setTab("Search")}><Text style={s.viewAll}>See all  ›</Text></Pressable></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.categoryRow}>
        {[{id:"all",name:"All products",slug:"all",icon:"all-products"},...categories].map(c =>
          <Pressable key={c.id} onPress={() => {setCategory(c.slug);setTab("Search");}} style={[s.categoryTile,category===c.slug&&s.categoryTileActive]}>
            <View style={[s.categoryIcon,category===c.slug&&s.categoryIconActive]}><MarketIcon name={c.slug} size={22} color={category===c.slug?"#ffffff":"#e87520"} /></View>
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
      {tab==="Search"?adPlacement("search"):null}
      {loading ? <View style={s.loading}><ActivityIndicator size="large" color="#ef7b25"/><Text style={s.loadingText}>Loading marketplace…</Text></View>
        : filtered.length ? <FlatList data={filtered} renderItem={productCard} keyExtractor={p=>p.id} numColumns={gridColumns} scrollEnabled={false} columnWrapperStyle={[s.productRow,{gap:horizontalGutter}]} contentContainerStyle={{paddingHorizontal:horizontalGutter}} />
        : emptyCatalogue}
      <View style={s.trust}><Text style={s.trustTitle}>Made for Malawi</Text><Text style={s.trustText}>Discover products, support local sellers and shop from one place.</Text></View>
    </ScrollView>
    : tab === "Cart" ? <ScrollView contentContainerStyle={s.page}>
      <Text style={s.pageTitle}>{marketText(language,"Your cart")}</Text>
      {cartProducts.length === 0 ? <Text style={s.empty}>Your cart is empty. Explore products and add something you like.</Text> :
        <>{cartProducts.map(({product:p,quantity},index) => <View key={p.id} style={s.cartRow}>
          {productImage(p) ? <Image source={{uri:productImage(p)}} style={s.cartImage} resizeMode="cover"/> : <View style={[s.cartImage,s.imagePlaceholder]}/>}
          <View style={{flex:1}}><Text style={s.productName}>{p.title}</Text><Text style={s.price}>{money(p.price_mwk)}</Text><Text style={s.seller}>Quantity: {quantity}</Text>
            <View style={{flexDirection:"row",alignItems:"center",gap:12,marginTop:7}}>
              <Pressable onPress={()=>updateCart(v=>{const i=v.indexOf(p.id);if(i<0)return v;const copy=[...v];copy.splice(i,1);return copy;})} style={s.qtyButton}><Text style={s.qtyText}>−</Text></Pressable>
              <Text style={s.qtyText}>{quantity}</Text>
              <Pressable onPress={()=>addToCart(p.id)} style={s.qtyButton}><Text style={s.qtyText}>+</Text></Pressable>
            </View>
          </View>
          <Pressable onPress={() => updateCart(v => v.filter(id=>id!==p.id))}><Text style={{color:"#c44",padding:8}}>Remove</Text></Pressable>
        </View>)}
        <Text style={s.total}>Subtotal: {money(cartTotal)}</Text>
        <Pressable style={s.primaryButton} onPress={()=>{if(cartProducts.some(item=>item.product.demo)){Alert.alert("Demo preview only","Remove demo products from your cart before starting a real checkout.");return;}setCheckout(true);}}><Text style={s.primaryText}>{marketText(language,"Proceed to secure checkout")}</Text></Pressable>
        <Text style={s.detailDescription}>Checkout uses OneKhusa. Payment is only confirmed after a verified provider notification.</Text>
        </>}
    </ScrollView>
    : tab === "QR" ? <QRToolsScreen products={products.filter(item => !item.demo)} initialProduct={qrProduct && !qrProduct.demo ? qrProduct : null} onProductChange={product => setQrProduct(product ? products.find(item => item.id === product.id) ?? null : null)} onScan={handleQrScan} onBack={() => { setTab("Home"); setQrProduct(null); }} />
    : tab === "Wishlist" ? <ScrollView contentContainerStyle={s.page}>
      <Text style={s.pageTitle}>{marketText(language,"Wishlist")}</Text>
      {savedProducts.length ? <FlatList data={savedProducts} renderItem={productCard} keyExtractor={p=>p.id} numColumns={gridColumns} scrollEnabled={false} columnWrapperStyle={[s.productRow,{gap:horizontalGutter}]} contentContainerStyle={{paddingHorizontal:horizontalGutter}}/> :
        <Text style={s.empty}>Products you save will appear here.</Text>}
    </ScrollView>
    : tab === "Explore" ? <ExploreScreens language={language} onHardwareBack={() => setTab("Home")} /> : <AccountScreens language={language} onHardwareBack={() => setTab("Home")} onLanguageChange={setLanguage} passwordRecovery={passwordRecovery} onPasswordRecoveryComplete={()=>setPasswordRecovery(false)} onAppearanceChange={(theme,accentColor)=>setAppearance({theme,accentColor})} />}
    {nav}
    {splashVisible ? <View style={s.splashOverlay}>
      <Image source={require("./assets/logo.png")} style={s.splashLogo} resizeMode="contain" />
      <Text style={s.splashBrand}><Text style={{color:"#f0782b"}}>Malawi</Text> Market</Text>
      <Text style={s.splashCaption}>A better way to shop local.</Text>
      <ActivityIndicator size="small" color="#ef7b25" style={{marginTop:22}} />
    </View> : null}
    </View>
  </SafeAreaView>;
}


const s = StyleSheet.create({
 safe:{flex:1,backgroundColor:"#ffffff"},topStrip:{backgroundColor:"#f36f21",paddingVertical:6,alignItems:"center"},stripText:{color:"#fff",fontSize:9,fontWeight:"800",letterSpacing:1},
 header:{height:62,paddingHorizontal:18,flexDirection:"row",alignItems:"center",justifyContent:"space-between",backgroundColor:"#fff"},brand:{fontSize:23,fontWeight:"700",color:"#202124",letterSpacing:-.8},tagline:{fontSize:11,color:"#4b5563",marginTop:0},
 cartIcon:{padding:10},cartCount:{position:"absolute",right:0,top:0,backgroundColor:"#ef7b25",color:"#fff",fontSize:10,fontWeight:"bold",borderRadius:10,minWidth:18,textAlign:"center",overflow:"hidden"},
 search:{height:50,borderRadius:14,backgroundColor:"#f5f5f7",borderWidth:1,borderColor:"#f0f0f2",paddingLeft:14,paddingRight:5,flexDirection:"row",alignItems:"center",gap:10,marginTop:12},searchInput:{flex:1,fontSize:14,color:"#252a31",paddingVertical:0},
 hero:{backgroundColor:"#f36f21",marginHorizontal:14,marginTop:4,borderRadius:15,padding:19,overflow:"hidden"},heroTop:{flexDirection:"row",alignItems:"center",justifyContent:"space-between"},heroKicker:{color:"#ffbd82",fontSize:10,fontWeight:"900",letterSpacing:1.1},heroTag:{color:"#fff",fontSize:10,fontWeight:"900",letterSpacing:2,borderWidth:1,borderColor:"#ffbf91",borderRadius:5,paddingHorizontal:8,paddingVertical:5},heroTitle:{color:"#fff",fontSize:24,lineHeight:30,fontWeight:"900",marginTop:11},heroSub:{color:"#ffffff",fontSize:13,marginTop:7,lineHeight:19},heroButton:{backgroundColor:"#ef7b25",alignSelf:"flex-start",paddingHorizontal:16,paddingVertical:12,borderRadius:8,marginTop:14},heroButtonText:{color:"#fff",fontWeight:"900",fontSize:13},
 sectionHead:{paddingHorizontal:17,marginTop:25,marginBottom:13,flexDirection:"row",alignItems:"center",justifyContent:"space-between"},sectionTitle:{fontSize:20,fontWeight:"900",color:"#252a31",letterSpacing:-.55},viewAll:{fontSize:12,color:"#e76f18",fontWeight:"800"},
 categoryRow:{paddingHorizontal:16,gap:11},categoryTile:{width:88,minHeight:108,backgroundColor:"#fff",borderRadius:17,padding:10,alignItems:"center",justifyContent:"center",gap:8,borderWidth:1,borderColor:"#d9dde3"},categoryTileActive:{borderColor:"#ef7628",backgroundColor:"#ef7628"},categoryIcon:{width:50,height:50,borderRadius:17,backgroundColor:"#fff0e5",alignItems:"center",justifyContent:"center"},categoryIconActive:{backgroundColor:"#202124"},categoryIconText:{fontSize:20,fontWeight:"900",color:"#e87520"},categoryIconTextActive:{color:"#fff"},categoryText:{fontSize:10.5,lineHeight:14,fontWeight:"800",color:"#414b59",textAlign:"center"},categoryTextActive:{color:"#ffffff",fontWeight:"900"},
 productRow:{gap:12,marginBottom:16},card:{flex:1,backgroundColor:"#ffffff",borderWidth:1,borderColor:"#d9dde3",borderRadius:16,overflow:"hidden",elevation:0,shadowColor:"#000000",shadowOpacity:0,shadowRadius:0,shadowOffset:{width:0,height:0}},imageWrap:{position:"relative",padding:7,backgroundColor:"#f3f4f6"},productImage:{width:"100%",aspectRatio:1,backgroundColor:"#f3f4f6",borderRadius:11},imagePlaceholder:{alignItems:"center",justifyContent:"center"},placeholderText:{fontSize:12,color:"#4b5563"},badge:{position:"absolute",left:9,top:9,backgroundColor:"#ef7b25",color:"#fff",fontSize:10,fontWeight:"900",paddingHorizontal:8,paddingVertical:5,borderRadius:5,overflow:"hidden"},heart:{position:"absolute",right:8,top:8,backgroundColor:"#fff",width:36,height:36,borderRadius:18,alignItems:"center",justifyContent:"center",elevation:2},
 cardInfo:{paddingHorizontal:13,paddingTop:10,paddingBottom:13},productName:{fontSize:13,fontWeight:"700",color:"#202b3c",lineHeight:18,minHeight:36},price:{fontSize:16,fontWeight:"700",color:"#202124",marginTop:7,letterSpacing:-.25},oldPrice:{fontSize:11,color:"#5b6470",textDecorationLine:"line-through"},seller:{fontSize:10,color:"#4b5563",marginTop:7},addButton:{backgroundColor:"#ef7628",borderRadius:11,alignItems:"center",justifyContent:"center",paddingVertical:11,marginTop:12,minHeight:44},addText:{color:"#fff",fontWeight:"900",fontSize:12,letterSpacing:.2},
 bottomNav:{position:"absolute",bottom:8,left:10,right:10,height:64,borderTopWidth:1,borderTopColor:"#d9dde3",backgroundColor:"#ffffff",flexDirection:"row",justifyContent:"space-around",alignItems:"center",paddingBottom:2,borderRadius:18,elevation:8,shadowColor:"#000000",shadowOpacity:0.07,shadowRadius:12,shadowOffset:{width:0,height:4}},navItem:{alignItems:"center",justifyContent:"center",flex:1,minHeight:54,paddingHorizontal:2},navIcon:{fontSize:24},navLabel:{fontSize:10,fontWeight:"800",marginTop:4},
 demoNotice:{marginHorizontal:14,marginTop:8,padding:10,borderRadius:8,backgroundColor:"#fff4e9"},demoNoticeText:{fontSize:10,color:"#8b4c18",fontWeight:"700",lineHeight:15},demoDetail:{fontSize:11,color:"#9a5b20",fontWeight:"800",marginTop:10},trust:{margin:15,padding:18,backgroundColor:"#fff",borderWidth:1,borderColor:"#d9dde3",borderRadius:12},trustTitle:{fontWeight:"900",fontSize:16,color:"#252a31"},trustText:{fontSize:13,color:"#4b5563",marginTop:5,lineHeight:19},
 filterPanel:{marginHorizontal:14,marginTop:4,padding:16,backgroundColor:"#fff",borderWidth:1,borderColor:"#d9dde3",borderRadius:13},filterHeading:{fontSize:13,fontWeight:"900",color:"#414b59",marginTop:5,marginBottom:8},filterRow:{flexDirection:"row",flexWrap:"wrap",gap:7,marginBottom:10},filterPill:{borderWidth:1,borderColor:"#cbd1d9",borderRadius:18,paddingHorizontal:13,paddingVertical:10,backgroundColor:"#fff"},filterActive:{backgroundColor:"#f36f21",borderColor:"#f36f21"},filterText:{fontSize:12,color:"#414b59",fontWeight:"800"},page:{padding:18,paddingBottom:130},pageTitle:{fontSize:26,fontWeight:"900",color:"#252a31",marginBottom:16},empty:{color:"#4b5563",fontSize:15,lineHeight:23,paddingVertical:25,textAlign:"center"},emptyBox:{marginHorizontal:16,marginTop:22,padding:22,backgroundColor:"#fff",borderRadius:13,alignItems:"center"},emptyTitle:{fontSize:18,fontWeight:"900",color:"#252a31"},outlineButton:{marginTop:12,borderWidth:1,borderColor:"#ef7b25",paddingHorizontal:16,paddingVertical:11,borderRadius:8},outlineText:{fontSize:13,color:"#df6c19",fontWeight:"900"},loading:{padding:35,alignItems:"center",gap:10},loadingText:{fontSize:13,color:"#777"},
 cartRow:{flexDirection:"row",alignItems:"center",gap:10,borderBottomWidth:1,borderColor:"#eee",paddingVertical:12},cartImage:{width:72,height:72,borderRadius:9,backgroundColor:"#f3f4f6"},qtyButton:{width:32,height:32,borderRadius:8,backgroundColor:"#fff1e5",alignItems:"center",justifyContent:"center"},qtyText:{fontSize:14,fontWeight:"900",color:"#252a31"},total:{fontSize:18,fontWeight:"900",color:"#252a31",marginTop:20,textAlign:"right"},
 back:{padding:16},backText:{color:"#ef7b25",fontWeight:"900"},detailImage:{width:"100%",height:320,backgroundColor:"#f3f4f6",borderRadius:20,overflow:"hidden"},detailTitle:{fontSize:25,fontWeight:"900",color:"#252a31",letterSpacing:-.55,lineHeight:32},priceLarge:{fontSize:27,fontWeight:"900",color:"#ef7b25",marginTop:12},detailMeta:{fontSize:12,color:"#4b5563",marginTop:9},detailDescription:{fontSize:14,color:"#4b5563",lineHeight:22,marginTop:18},primaryButton:{backgroundColor:"#ef7b25",padding:17,borderRadius:13,alignItems:"center",marginTop:20,minHeight:54,justifyContent:"center",elevation:2},primaryText:{color:"#fff",fontWeight:"900",fontSize:14},reportButton:{alignItems:"center",padding:14,marginTop:8},reportText:{color:"#a33",fontWeight:"800",fontSize:12},
 adCard:{marginHorizontal:16,marginTop:12,backgroundColor:"#fff",borderWidth:1,borderColor:"#eadfd6",borderRadius:14,overflow:"hidden",flexDirection:"row",minHeight:112},adImage:{width:104,minHeight:112,backgroundColor:"#f2f2f2"},adCopy:{flex:1,padding:11,justifyContent:"center"},adLabel:{fontSize:9,color:"#a45a24",fontWeight:"900",letterSpacing:.7},adTitle:{fontSize:14,color:"#252a31",fontWeight:"900",marginTop:5},adBody:{fontSize:11,color:"#5b6470",marginTop:4,lineHeight:15},adLink:{fontSize:10,color:"#ef7628",fontWeight:"900",marginTop:6},
 homeTop:{paddingHorizontal:18,paddingTop:10,paddingBottom:4,backgroundColor:"#fffaf5"},
 homeBrandRow:{minHeight:58,flexDirection:"row",alignItems:"center",justifyContent:"space-between"},
 homeLogo:{width:76,height:66},
 homeActions:{flexDirection:"row",alignItems:"center",gap:12},
 homeAction:{width:43,height:43,borderRadius:22,alignItems:"center",justifyContent:"center",position:"relative"},
 homeAvatar:{backgroundColor:"#f3eee9"},
 notificationDot:{position:"absolute",right:8,top:7,width:10,height:10,borderRadius:5,backgroundColor:"#e84632",borderWidth:1.5,borderColor:"#fffaf5"},
 homeGreeting:{fontSize:27,lineHeight:34,fontWeight:"900",color:"#342018",letterSpacing:-.7,marginTop:17},
 homeWelcome:{fontSize:14,color:"#51453e",marginTop:4,marginBottom:17},
 homeSearch:{height:52,borderRadius:17,backgroundColor:"#fff",borderWidth:1,borderColor:"#eee7e1",paddingLeft:14,paddingRight:7,flexDirection:"row",alignItems:"center",gap:10,elevation:2,shadowColor:"#33251e",shadowOpacity:.06,shadowRadius:8,shadowOffset:{width:0,height:3}},
 homeSearchInput:{flex:1,fontSize:14,color:"#252a31",paddingVertical:0},
 homeFilter:{width:40,height:40,borderLeftWidth:1,borderLeftColor:"#eee7e1",alignItems:"center",justifyContent:"center"},
 marketHeader:{backgroundColor:"#ffffff",paddingHorizontal:20,paddingTop:8,paddingBottom:16,borderBottomWidth:1,borderBottomColor:"#d9dde3"},marketHeaderTop:{height:56,flexDirection:"row",alignItems:"center",justifyContent:"space-between"},marketEyebrow:{fontSize:9,fontWeight:"900",letterSpacing:1.5,color:"#4b5563",marginBottom:2},headerAction:{width:46,height:46,borderRadius:16,backgroundColor:"#fff5ed",borderWidth:1,borderColor:"#ffeadb",alignItems:"center",justifyContent:"center"},searchGlyph:{fontSize:22,color:"#666",width:22,textAlign:"center"},searchAction:{backgroundColor:"#ef7628",paddingHorizontal:17,paddingVertical:11,borderRadius:12},searchActionText:{color:"#fff",fontSize:13,fontWeight:"900"},locationLine:{flexDirection:"row",justifyContent:"space-between",marginTop:10,paddingHorizontal:2},locationText:{fontSize:10,color:"#4b5563",fontWeight:"700"},promoBanner:{marginHorizontal:18,marginTop:13,minHeight:194,borderRadius:22,backgroundColor:"#ef7628",padding:23,flexDirection:"row",overflow:"hidden",justifyContent:"space-between",alignItems:"center",borderWidth:1,borderColor:"#d9dde3"},promoCopy:{flex:1,paddingRight:3,zIndex:2},heroOrbLarge:{position:"absolute",width:230,height:230,borderRadius:115,right:-65,top:-95,backgroundColor:"#d95f18",borderWidth:1,borderColor:"#ffad76"},heroOrbSmall:{position:"absolute",width:145,height:145,borderRadius:73,right:12,bottom:-92,backgroundColor:"#e66b20",borderWidth:1,borderColor:"#ffad76"},promoKicker:{fontSize:9,color:"#ffffff",fontWeight:"800",letterSpacing:1.5},promoTitle:{fontSize:28,lineHeight:34,fontWeight:"900",color:"#ffffff",marginTop:10,maxWidth:280,letterSpacing:-.9},promoSub:{fontSize:12,lineHeight:19,color:"#ffffff",marginTop:8,maxWidth:270},promoButton:{alignSelf:"flex-start",backgroundColor:"#202124",paddingHorizontal:17,paddingVertical:13,borderRadius:12,marginTop:17,elevation:2},promoButtonText:{color:"#fff",fontSize:12,fontWeight:"900",letterSpacing:.1},shortcutRow:{flexDirection:"row",justifyContent:"space-around",backgroundColor:"#fff",marginTop:14,paddingVertical:15,borderRadius:15,marginHorizontal:16,borderWidth:1,borderColor:"#d9dde3",elevation:0,shadowColor:"#182b45",shadowOpacity:0,shadowRadius:0,shadowOffset:{width:0,height:0}},shortcut:{alignItems:"center",flex:1},shortcutIcon:{width:45,height:45,borderRadius:14,backgroundColor:"#fff2e9",alignItems:"center",justifyContent:"center"},shortcutGlyph:{fontSize:23,color:"#ed6b1b",fontWeight:"800"},shortcutLabel:{fontSize:11,color:"#3c424a",fontWeight:"700",marginTop:6},sectionHint:{fontSize:11,color:"#858b94",marginTop:3},featuredRow:{paddingHorizontal:12,gap:10},featuredCard:{width:164,backgroundColor:"#fff",borderRadius:18,padding:10,borderWidth:1,borderColor:"#d9dde3",elevation:2,shadowColor:"#252a31",shadowOpacity:0.055,shadowRadius:10,shadowOffset:{width:0,height:4}},featuredImage:{width:"100%",height:144,backgroundColor:"#f3f4f6",borderRadius:12},featuredName:{fontSize:12,color:"#343a42",fontWeight:"700",lineHeight:16,marginTop:8,minHeight:32},featuredPrice:{fontSize:15,color:"#222831",fontWeight:"900",marginTop:5},featuredSeller:{fontSize:9,color:"#23865a",fontWeight:"700",marginTop:3},
 splashOverlay:{...StyleSheet.absoluteFillObject,backgroundColor:"#ffffff",alignItems:"center",justifyContent:"center",zIndex:50},splashLogo:{width:112,height:112,marginBottom:18},splashBrand:{fontSize:29,fontWeight:"900",letterSpacing:-1.1,color:"#252a31"},splashCaption:{fontSize:12,color:"#7b8796",fontWeight:"600",marginTop:7,letterSpacing:.2},
 brandLockup:{flexDirection:"row",alignItems:"center",gap:9},brandLogo:{width:49,height:49,borderRadius:12},
});
