/**
 * NUNULIA — Admin Dashboard shared types
 */
import { Product, User, Category, Country, Currency } from '../../types';
import type { BannerData, BannerActionType } from '../../services/firebase';

export type AdminTab = 'overview' | 'products' | 'subs' | 'users' | 'banners' | 'categories' | 'currencies' | 'requests';

// Countries et Languages gérés directement via Firebase Console

export interface AdminSharedProps {
  currentUser: User;
  refreshData: () => Promise<void>;
  loading: boolean;
}

export interface OverviewProps extends AdminSharedProps {
  users: User[];
  products: Product[];
  banners: BannerData[];
  pendingCount: number;
  sellerCount: number;
  approvedCount: number;
  expiringSoonSellers: User[];
  setActiveTab: (tab: AdminTab) => void;
  setProductFilter: (f: 'all' | 'pending' | 'approved' | 'rejected') => void;
  setSellerStatusFilter: (f: 'all' | 'active' | 'suspended' | 'expiring') => void;
}

export interface ProductsProps extends AdminSharedProps {
  products: Product[];
  allProducts: Product[];
  categories: Category[];
  pendingCount: number;
  productFilter: 'all' | 'pending' | 'approved' | 'rejected';
  setProductFilter: (f: 'all' | 'pending' | 'approved' | 'rejected') => void;
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  setAllProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  rejectingProductId: string | null;
  setRejectingProductId: (id: string | null) => void;
  rejectReason: string;
  setRejectReason: (r: string) => void;
}

export interface BannersProps extends AdminSharedProps {
  banners: BannerData[];
  categories: Category[];
  setBanners: React.Dispatch<React.SetStateAction<BannerData[]>>;
}

export interface SubscriptionsProps extends AdminSharedProps {}

export interface UsersProps extends AdminSharedProps {
  users: User[];
  countries: Country[];
  setUsers: React.Dispatch<React.SetStateAction<User[]>>;
  onContactUser: (user: User) => void;
}

export interface CategoriesProps extends AdminSharedProps {
  categories: Category[];
}

export interface CurrenciesProps extends AdminSharedProps {
  currencies: Currency[];
  countries: Country[];
  setCurrencies: React.Dispatch<React.SetStateAction<Currency[]>>;
}
