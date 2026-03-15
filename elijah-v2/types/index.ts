export interface JourneyStop {
  id: number;
  city: string;
  country: string;
  description: string;
  team?: string;
  coordinates: [number, number]; // [lng, lat]
  year?: string;
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  category: 'Training' | 'Recovery' | 'Everyday' | 'Tech' | 'Family' | 'Travel';
  shortDescription: string;
  whyIUseIt: string;
  affiliateUrl: string;
  image?: string;
  featured: boolean;
  badge?: string;
  sortOrder: number;
}

export interface EcosystemChannel {
  platform: string;
  handle: string;
  url: string;
  description?: string;
}

export interface EcosystemLane {
  id: string;
  name: string;
  description: string;
  channels: EcosystemChannel[];
}

export interface MapDot {
  country: string;
  coordinates: [number, number];
  count: number;
}
