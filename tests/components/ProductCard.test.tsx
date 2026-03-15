import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProductCard } from '../../components/ProductCard';
import { Product } from '../../types';

// Mock firebase services used by ProductCard
vi.mock('../../services/firebase', () => ({
  toggleLikeProduct: vi.fn(),
  checkIsLiked: vi.fn().mockResolvedValue(false),
}));

const mockProduct: Product = {
  id: 'p1',
  slug: 'test-product',
  title: 'iPhone 15 Pro',
  price: 1500000,
  description: 'Test description',
  images: ['https://example.com/image.jpg'],
  category: 'electronique',
  subCategory: 'telephones',
  rating: 4.5,
  reviews: 10,
  seller: {
    id: 'seller1',
    name: 'Tech Shop',
    email: 'shop@test.com',
    avatar: '',
    isVerified: true,
    role: 'seller',
    joinDate: Date.now(),
  },
  status: 'approved',
  views: 150,
  likesCount: 25,
  reports: 0,
  createdAt: Date.now(),
  tags: ['apple', 'iphone'],
  isPromoted: false,
};

describe('ProductCard', () => {
  it('renders product title', () => {
    render(<ProductCard product={mockProduct} onClick={() => {}} />);
    expect(screen.getByText('iPhone 15 Pro')).toBeInTheDocument();
  });

  it('renders formatted price', () => {
    render(<ProductCard product={mockProduct} onClick={() => {}} />);
    // Price is formatted with French locale
    expect(screen.getByText(/1[\s\u202f]500[\s\u202f]000/)).toBeInTheDocument();
  });

  it('renders seller name', () => {
    render(<ProductCard product={mockProduct} onClick={() => {}} />);
    expect(screen.getByText(/Tech Shop/)).toBeInTheDocument();
  });

  it('renders rating', () => {
    render(<ProductCard product={mockProduct} onClick={() => {}} />);
    expect(screen.getByText('4.5')).toBeInTheDocument();
  });

  it('renders views count', () => {
    render(<ProductCard product={mockProduct} onClick={() => {}} />);
    expect(screen.getByText('150')).toBeInTheDocument();
  });

  it('shows discount badge when originalPrice is set', () => {
    const discountProduct = {
      ...mockProduct,
      originalPrice: 2000000,
    };
    render(<ProductCard product={discountProduct} onClick={() => {}} />);
    expect(screen.getByText(/-25%/)).toBeInTheDocument();
  });

  it('shows low stock badge when stockQuantity <= 5', () => {
    const lowStockProduct = {
      ...mockProduct,
      stockQuantity: 3,
    };
    render(<ProductCard product={lowStockProduct} onClick={() => {}} />);
    expect(screen.getByText(/Plus que 3/)).toBeInTheDocument();
  });

  it('has accessible like button', () => {
    render(<ProductCard product={mockProduct} onClick={() => {}} />);
    const likeBtn = screen.getByRole('button', { name: /favoris/i });
    expect(likeBtn).toBeInTheDocument();
  });
});
