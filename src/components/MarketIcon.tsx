import React from "react";
import {
  Home, Compass, Search, Heart, UserRound, LayoutGrid, Star, ShoppingBag, QrCode,
  Cpu, Shirt, House, Smartphone, Laptop, Sparkles, Sprout, CarFront, Dumbbell,
  BookOpen, CookingPot, BriefcaseBusiness, CircleUserRound, Store, Package, Bell,
  Settings, LayoutDashboard, FileText, TrendingUp, Newspaper, Briefcase, CloudSun,
  MapPin, Trophy, CircleHelp
} from "lucide-react-native";

const icons = {
  home: Home, explore: Compass, search: Search, wishlist: Heart, account: UserRound,
  categories: LayoutGrid, "all-products": LayoutGrid, featured: Star, cart: ShoppingBag, qr: QrCode,
  electronics: Cpu, fashion: Shirt, "home-living": House, "phones-tablets": Smartphone,
  computers: Laptop, beauty: Sparkles, agriculture: Sprout, "vehicles-parts": CarFront,
  "sports-outdoors": Dumbbell, "books-education": BookOpen, "kitchen-dining": CookingPot,
  "business-supplies": BriefcaseBusiness, seller: Store, orders: Package,
  notifications: Bell, settings: Settings, admin: LayoutDashboard, drafts: FileText,
  stocks: TrendingUp, news: Newspaper, jobs: Briefcase, weather: CloudSun, map: MapPin,
  football: Trophy
};

type Props = { name: string; size?: number; color?: string };

export function MarketIcon({ name, size = 22, color = "#e87520" }: Props) {
  const Icon = icons[name as keyof typeof icons] ?? CircleHelp;
  return <Icon size={size} color={color} strokeWidth={2.1} />;
}
