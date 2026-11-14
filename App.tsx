import React, { useEffect, useMemo, useState } from "react";
import {
  SafeAreaView, ScrollView, View, Text, TextInput, Image, Pressable,
  StatusBar, StyleSheet, FlatList, ActivityIndicator, RefreshControl
} from "react-native";
import { supabase } from "./src/lib/supabase";

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
};
const money = (n: number) => "MK " + Number(n || 0).toLocaleString("en-US");
const productImage = (p: Product) =>
  p.images?.find(x => x.is_primary)?.image_url ??
  [...(p.images ?? [])].sort((a,b) => a.sort_order-b.sort_order)[0]?.image_url;

export default function App() {
  const [tab, setTab] = useState("Home");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [cart, setCart] = useState<string[]>([]);
  const [saved, setSaved] = useState<string[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selected, setSelected] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");

  const loadCatalogue = async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setLoadError("");
    const [categoryResult, productResult] = await Promise.all([
      supabase.from("market_categories").select("id,name,slug,icon").eq("is_active", true).order("sort_order"),
      supabase.from("market_products")
        .select("id,title,description,price_mwk,compare_at_price_mwk,condition,stock_quantity,location,is_featured,category:market_categories(name,slug),seller:market_sellers(name,slug,location,is_verified),images:market_product_images(image_url,sort_order,is_primary)")
        .eq("status", "published")
        .order("is_featured", { ascending: false })
        .order("published_at", { ascending: false }),
    ]);
    if (categoryResult.error || productResult.error) {
      setLoadError(categoryResult.error?.message ?? productResult.error?.message ?? "Could not load the catalogue.");
    } else {
      setCategories((categoryResult.data ?? []) as Category[]);
      setProducts((productResult.data ?? []) as Product[]);
    }
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => { void loadCatalogue(); }, []);

  const filtered = useMemo(() => products.filter(p => {
    const matchesCategory = category === "all" || p.category?.slug === category;
    const searchText = query.trim().toLowerCase();
    const matchesQuery = !searchText ||
      p.title.toLowerCase().includes(searchText) ||
      (p.description ?? "").toLowerCase().includes(searchText) ||
      (p.seller?.name ?? "").toLowerCase().includes(searchText) ||
      (p.category?.name ?? "").toLowerCase().includes(searchText);
    return matchesCategory && matchesQuery;
  }), [products, category, query]);

  const addToCart = (id: string) => setCart(current => [...current, id]);
  const toggleSaved = (id: string) =>
    setSaved(current => current.includes(id) ? current.filter(x => x !== id) : [...current, id]);
  const cartProducts = cart.map(id => products.find(p => p.id === id)).filter((p): p is Product => Boolean(p));
  const cartTotal = cartProducts.reduce((sum, p) => sum + Number(p.price_mwk), 0);
  const savedProducts = products.filter(p => saved.includes(p.id));

  const header = <>
    <View style={s.topStrip}><Text style={s.stripText}>SHOP LOCAL. BUY SMART. SELL MORE.</Text></View>
    <View style={s.header}>
      <View><Text style={s.brand}><Text style={{color:"#ef7b25"}}>Malawi</Text> Market</Text><Text style={s.tagline}>Malawi's marketplace</Text></View>
      <Pressable style={s.cartIcon} onPress={() => { setSelected(null); setTab("Cart"); }}>
        <Text style={{fontSize:23}}>🛒</Text>{cart.length > 0 ? <Text style={s.cartCount}>{cart.length}</Text> : null}
      </Pressable>
    </View>
    <View style={s.search}>
      <Text style={{fontSize:18,color:"#777"}}>⌕</Text>
      <TextInput placeholder="Search products, brands and more" placeholderTextColor="#888" value={query} onChangeText={setQuery} style={s.searchInput} returnKeyType="search" onFocus={() => setTab("Search")} />
      <Text style={{color:"#777"}}>☷</Text>
    </View>
  </>;

  const productCard = ({ item }: { item: Product }) => {
    const image = productImage(item);
    return <Pressable style={s.card} onPress={() => setSelected(item)}>
      <View style={s.imageWrap}>
        {image ? <Image source={{uri:image}} style={s.productImage} resizeMode="cover" /> :
          <View style={[s.productImage,s.imagePlaceholder]}><Text style={s.placeholderText}>No image</Text></View>}
        {item.is_featured ? <Text style={s.badge}>FEATURED</Text> : null}
        <Pressable style={s.heart} onPress={() => toggleSaved(item.id)}>
          <Text style={{fontSize:19,color:saved.includes(item.id)?"#e34d59":"#444"}}>{saved.includes(item.id)?"♥":"♡"}</Text>
        </Pressable>
      </View>
      <View style={s.cardInfo}>
        <Text numberOfLines={2} style={s.productName}>{item.title}</Text>
        <Text style={s.price}>{money(item.price_mwk)}</Text>
        {item.compare_at_price_mwk ? <Text style={s.oldPrice}>{money(item.compare_at_price_mwk)}</Text> : null}
        <Text numberOfLines={1} style={s.seller}>{item.seller?.name ?? "Malawi Market seller"}{item.seller?.is_verified ? "  ✓" : ""}</Text>
        <Pressable style={s.addButton} onPress={() => addToCart(item.id)}><Text style={s.addText}>Add to cart</Text></Pressable>
      </View>
    </Pressable>;
  };

  const nav = <View style={s.bottomNav}>
    {[[ "Home","⌂" ],[ "Search","⌕" ],[ "Wishlist","♡" ],[ "Cart","🛒" ],[ "Account","♙" ]].map(([name,icon]) =>
      <Pressable key={name} onPress={() => { setSelected(null); setTab(name); }} style={s.navItem}>
        <Text style={[s.navIcon,{color:tab===name?"#ef7b25":"#777"}]}>{icon}</Text>
        <Text style={[s.navLabel,{color:tab===name?"#ef7b25":"#777"}]}>{name}</Text>
      </Pressable>)}
  </View>;

  const emptyCatalogue = <View style={s.emptyBox}>
    <Text style={s.emptyTitle}>{loadError ? "Catalogue unavailable" : "No products listed yet"}</Text>
    <Text style={s.empty}>{loadError ? loadError : "Products published by Malawi Market sellers will appear here. We are not displaying sample or fake listings."}</Text>
    <Pressable style={s.outlineButton} onPress={() => void loadCatalogue(true)}><Text style={s.outlineText}>Refresh catalogue</Text></Pressable>
  </View>;

  return <SafeAreaView style={s.safe}>
    <StatusBar backgroundColor="#fff" barStyle="dark-content" />
    {header}
    {selected ? <ScrollView contentContainerStyle={{paddingBottom:100}}>
      <Pressable onPress={() => setSelected(null)} style={s.back}><Text style={s.backText}>‹  Back to shopping</Text></Pressable>
      {productImage(selected) ? <Image source={{uri:productImage(selected)}} style={s.detailImage} resizeMode="contain" /> :
        <View style={[s.detailImage,s.imagePlaceholder]}><Text style={s.placeholderText}>No product image</Text></View>}
      <View style={{padding:18}}>
        <Text style={s.detailTitle}>{selected.title}</Text>
        <Text style={s.priceLarge}>{money(selected.price_mwk)}</Text>
        <Text style={s.seller}>{selected.seller?.name ?? "Malawi Market seller"}{selected.seller?.is_verified ? " · Verified seller" : ""}</Text>
        <Text style={s.detailMeta}>{selected.category?.name ?? "Marketplace"} · {selected.condition} · {selected.stock_quantity} available{selected.location ? " · "+selected.location : ""}</Text>
        <Text style={s.detailDescription}>{selected.description || "No product description has been provided."}</Text>
        <Pressable style={s.primaryButton} onPress={() => addToCart(selected.id)}><Text style={s.primaryText}>Add to cart</Text></Pressable>
      </View>
    </ScrollView>
    : tab === "Home" || tab === "Search" ? <ScrollView contentContainerStyle={{paddingBottom:100}} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadCatalogue(true)} />}>
      <View style={s.hero}>
        <Text style={s.heroKicker}>DISCOVER MORE. SHOP BETTER.</Text>
        <Text style={s.heroTitle}>Your marketplace,{"\n"}right here in Malawi.</Text>
        <Text style={s.heroSub}>Find products from sellers across Malawi.</Text>
        <Pressable style={s.heroButton} onPress={() => setTab("Search")}><Text style={s.heroButtonText}>Explore products  →</Text></Pressable>
      </View>
      <View style={s.sectionHead}><Text style={s.sectionTitle}>Shop by category</Text></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.categoryRow}>
        {[{id:"all",name:"All",slug:"all"},...categories].map(c =>
          <Pressable key={c.id} onPress={() => setCategory(c.slug)} style={[s.categoryPill,category===c.slug&&s.categoryActive]}>
            <Text style={[s.categoryText,category===c.slug&&{color:"#fff"}]}>{c.name}</Text>
          </Pressable>)}
      </ScrollView>
      <View style={s.sectionHead}><Text style={s.sectionTitle}>{query ? "Search results" : "Latest products"}</Text><Text style={s.viewAll}>{filtered.length} items</Text></View>
      {loading ? <View style={s.loading}><ActivityIndicator size="large" color="#ef7b25"/><Text style={s.loadingText}>Loading marketplace…</Text></View>
        : filtered.length ? <FlatList data={filtered} renderItem={productCard} keyExtractor={p=>p.id} numColumns={2} scrollEnabled={false} columnWrapperStyle={s.productRow} contentContainerStyle={{paddingHorizontal:14}} />
        : emptyCatalogue}
      <View style={s.trust}><Text style={s.trustTitle}>Made for Malawi</Text><Text style={s.trustText}>Discover products, support local sellers and shop from one place.</Text></View>
    </ScrollView>
    : tab === "Cart" ? <ScrollView contentContainerStyle={s.page}>
      <Text style={s.pageTitle}>Your cart</Text>
      {cartProducts.length === 0 ? <Text style={s.empty}>Your cart is empty. Explore products and add something you like.</Text> :
        <>{cartProducts.map((p,index) => <View key={index} style={s.cartRow}>
          {productImage(p) ? <Image source={{uri:productImage(p)}} style={s.cartImage}/> : <View style={[s.cartImage,s.imagePlaceholder]}/>}
          <View style={{flex:1}}><Text style={s.productName}>{p.title}</Text><Text style={s.price}>{money(p.price_mwk)}</Text></View>
          <Pressable onPress={() => setCart(v => { const copy=[...v]; copy.splice(index,1); return copy; })}><Text style={{color:"#c44",padding:8}}>Remove</Text></Pressable>
        </View>)}
        <Text style={s.total}>Subtotal: {money(cartTotal)}</Text>
        <Text style={s.detailDescription}>Checkout and payment will be enabled after account and payment integration.</Text>
        </>}
    </ScrollView>
    : tab === "Wishlist" ? <ScrollView contentContainerStyle={s.page}>
      <Text style={s.pageTitle}>Wishlist</Text>
      {savedProducts.length ? <FlatList data={savedProducts} renderItem={productCard} keyExtractor={p=>p.id} numColumns={2} scrollEnabled={false} columnWrapperStyle={s.productRow}/> :
        <Text style={s.empty}>Products you save will appear here during this session.</Text>}
    </ScrollView>
    : <View style={s.page}><Text style={s.pageTitle}>Your account</Text><Text style={s.empty}>Account creation, sign-in and seller tools are intentionally deferred to a later phase.</Text></View>}
    {nav}
  </SafeAreaView>;
}

const s = StyleSheet.create({
 safe:{flex:1,backgroundColor:"#fff"},topStrip:{backgroundColor:"#172b4d",paddingVertical:7,alignItems:"center"},stripText:{color:"#fff",fontSize:10,fontWeight:"800",letterSpacing:1.2},
 header:{height:65,paddingHorizontal:18,flexDirection:"row",alignItems:"center",justifyContent:"space-between"},brand:{fontSize:24,fontWeight:"900",color:"#172b4d",letterSpacing:-.8},tagline:{fontSize:10,color:"#777",marginTop:-2},
 cartIcon:{padding:8},cartCount:{position:"absolute",right:0,top:0,backgroundColor:"#ef7b25",color:"#fff",fontSize:10,fontWeight:"bold",borderRadius:10,minWidth:17,textAlign:"center",overflow:"hidden"},
 search:{marginHorizontal:15,marginBottom:12,height:44,borderRadius:12,backgroundColor:"#f4f5f7",paddingHorizontal:12,flexDirection:"row",alignItems:"center",gap:9},searchInput:{flex:1,fontSize:13,color:"#172b4d"},
 hero:{backgroundColor:"#172b4d",marginHorizontal:14,marginTop:4,borderRadius:18,padding:22,overflow:"hidden"},heroKicker:{color:"#ffbd82",fontSize:10,fontWeight:"800",letterSpacing:1.4},heroTitle:{color:"#fff",fontSize:27,lineHeight:33,fontWeight:"900",marginTop:10},heroSub:{color:"#d8dfeb",fontSize:13,marginTop:9,lineHeight:19},heroButton:{backgroundColor:"#ef7b25",alignSelf:"flex-start",paddingHorizontal:15,paddingVertical:11,borderRadius:9,marginTop:17},heroButtonText:{color:"#fff",fontWeight:"800",fontSize:12},
 sectionHead:{paddingHorizontal:16,marginTop:22,marginBottom:12,flexDirection:"row",alignItems:"center",justifyContent:"space-between"},sectionTitle:{fontSize:18,fontWeight:"900",color:"#172b4d"},viewAll:{fontSize:11,color:"#ef7b25",fontWeight:"700"},
 categoryRow:{paddingHorizontal:14,gap:9},categoryPill:{borderWidth:1,borderColor:"#e6e8ec",borderRadius:22,paddingHorizontal:14,paddingVertical:9},categoryActive:{backgroundColor:"#172b4d",borderColor:"#172b4d"},categoryText:{fontSize:11,fontWeight:"700",color:"#39465a"},
 productRow:{gap:11,marginBottom:12},card:{flex:1,backgroundColor:"#fff",borderWidth:1,borderColor:"#eceef1",borderRadius:13,overflow:"hidden"},imageWrap:{position:"relative"},productImage:{width:"100%",height:142,backgroundColor:"#f2f3f5"},imagePlaceholder:{alignItems:"center",justifyContent:"center"},placeholderText:{fontSize:11,color:"#8a93a2"},badge:{position:"absolute",left:8,top:8,backgroundColor:"#ef7b25",color:"#fff",fontSize:9,fontWeight:"900",paddingHorizontal:7,paddingVertical:4,borderRadius:5,overflow:"hidden"},heart:{position:"absolute",right:7,top:6,backgroundColor:"#fff",width:29,height:29,borderRadius:15,alignItems:"center",justifyContent:"center"},
 cardInfo:{padding:10},productName:{fontSize:12,fontWeight:"700",color:"#202b3c",lineHeight:17,minHeight:34},price:{fontSize:14,fontWeight:"900",color:"#172b4d",marginTop:7},oldPrice:{fontSize:10,color:"#9299a4",textDecorationLine:"line-through"},seller:{fontSize:9,color:"#7a8492",marginTop:6},addButton:{backgroundColor:"#fff4eb",borderRadius:7,alignItems:"center",paddingVertical:8,marginTop:9},addText:{color:"#df6c19",fontWeight:"800",fontSize:11},
 bottomNav:{position:"absolute",bottom:0,left:0,right:0,height:62,borderTopWidth:1,borderTopColor:"#eceef1",backgroundColor:"#fff",flexDirection:"row",justifyContent:"space-around",alignItems:"center"},navItem:{alignItems:"center",justifyContent:"center",flex:1},navIcon:{fontSize:21},navLabel:{fontSize:9,fontWeight:"700",marginTop:2},
 trust:{margin:15,padding:18,backgroundColor:"#f4f6f9",borderRadius:12},trustTitle:{fontWeight:"900",fontSize:15,color:"#172b4d"},trustText:{fontSize:12,color:"#667085",marginTop:5,lineHeight:18},
 page:{padding:18,paddingBottom:100},pageTitle:{fontSize:25,fontWeight:"900",color:"#172b4d",marginBottom:16},empty:{color:"#777",fontSize:13,lineHeight:20,paddingVertical:25,textAlign:"center"},emptyBox:{marginHorizontal:16,marginTop:22,padding:20,backgroundColor:"#f6f7f9",borderRadius:13,alignItems:"center"},emptyTitle:{fontSize:16,fontWeight:"900",color:"#172b4d"},outlineButton:{marginTop:12,borderWidth:1,borderColor:"#ef7b25",paddingHorizontal:14,paddingVertical:9,borderRadius:8},outlineText:{fontSize:12,color:"#df6c19",fontWeight:"800"},loading:{padding:35,alignItems:"center",gap:10},loadingText:{fontSize:12,color:"#777"},
 cartRow:{flexDirection:"row",alignItems:"center",gap:10,borderBottomWidth:1,borderColor:"#eee",paddingVertical:12},cartImage:{width:65,height:65,borderRadius:9,backgroundColor:"#f2f3f5"},total:{fontSize:17,fontWeight:"900",color:"#172b4d",marginTop:20,textAlign:"right"},
 back:{padding:16},backText:{color:"#ef7b25",fontWeight:"800"},detailImage:{width:"100%",height:300,backgroundColor:"#f4f4f4"},detailTitle:{fontSize:22,fontWeight:"900",color:"#172b4d"},priceLarge:{fontSize:24,fontWeight:"900",color:"#ef7b25",marginTop:12},detailMeta:{fontSize:11,color:"#7a8492",marginTop:9},detailDescription:{fontSize:13,color:"#667085",lineHeight:20,marginTop:18},primaryButton:{backgroundColor:"#ef7b25",padding:15,borderRadius:10,alignItems:"center",marginTop:20},primaryText:{color:"#fff",fontWeight:"900"}
});
