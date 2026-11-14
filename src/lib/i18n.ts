export type MarketLanguage="English"|"Chichewa"|"Tumbuka";
const dictionaries:Record<Exclude<MarketLanguage,"English">,Record<string,string>>={
 Chichewa:{
  Home:"Poyambira",Search:"Sakani",Explore:"Onani",Wishlist:"Zosungidwa",Cart:"Ngolo",Account:"Akaunti",
  "Your cart":"Ngolo yanu","Shop by category":"Gulani potengera gulu","Latest products":"Zatsopano","Find products":"Pezani zinthu",
  "Add to cart":"Ikani mungolo","Out of stock":"Zatha","Refresh catalogue":"Bwezerani mndandanda",
  "No products listed yet":"Palibe zinthu zomwe zalembedwa","Back to shopping":"Bwererani kukagula",
  "Proceed to secure checkout":"Pitani kukalipira motetezeka","No products match your search":"Palibe zinthu zomwe zapezeka",
  "Product image":"Chithunzi cha chinthu","Price (MWK)":"Mtengo (MWK)","Stock quantity":"Chiwerengero cha katundu",
  News:"Nkhani","Job vacancies":"Ntchito","Malawi Stock Market":"Msika wa masheya ku Malawi",Football:"Mpira","Explore Malawi Market":"Onani Malawi Market",Business:"Bizinesi",Technology:"Ukadaulo",Agriculture:"Ulimi",Sports:"Masewera"
 },
 Tumbuka:{
  Home:"Kwakwamba",Search:"Penjani",Explore:"Wonani",Wishlist:"Ivyo mwasunga",Cart:"Ngolo",Account:"Akaunti",
  "Your cart":"Ngolo yinu","Shop by category":"Gulani kuyana na mtundu","Latest products":"Vinthu vipya","Find products":"Penjani vinthu",
  "Add to cart":"Sazgirani mu ngolo","Out of stock":"Palije katundu","Refresh catalogue":"Woneskaniso mndandanda",
  "No products listed yet":"Palije vinthu ivyo vyalembeka","Back to shopping":"Welera ku kugura",
  "Proceed to secure checkout":"Lutilirani ku kulipira mwakuvikilirika","No products match your search":"Palije vinthu ivyo vyasangika",
  "Product image":"Chithuzi cha chinthu","Price (MWK)":"Mtengo (MWK)","Stock quantity":"Unandi wa katundu",
  News:"Nkhani","Job vacancies":"Ntchito","Malawi Stock Market":"Msika wa masheya ku Malawi",Football:"Mpira","Explore Malawi Market":"Wonani Malawi Market",Business:"Bizinesi",Technology:"Tekinoloje",Agriculture:"Ulimi",Sports:"Maseŵero"
 }
};
export function marketText(language:MarketLanguage| string,key:string):string{
 if(language==="English")return key;
 return dictionaries[language as Exclude<MarketLanguage,"English">]?.[key]??key;
}
