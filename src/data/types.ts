export type DemoProduct = {
  id: string; title: string; description: string; price_mwk: number;
  compare_at_price_mwk?: number; condition: string; stock_quantity: number;
  location: string; is_featured: boolean;
  category: { name: string; slug: string };
  seller: { name: string; slug: string; location: string; is_verified: boolean };
  images: { image_url: string; sort_order: number; is_primary: boolean }[];
  demo: true;
};
