import { useMemo } from 'react';

export interface ScoreBreakdown {
  images: number;
  title: number;
  description: number;
  price: number;
  category: number;
  subCategory: number;
  originalPrice: number;
}

export interface ProductScore {
  total: number;
  max: number;
  percentage: number;
  breakdown: ScoreBreakdown;
  suggestions: string[];
  level: 'poor' | 'fair' | 'good' | 'excellent';
  color: string;
}

interface ScoreInput {
  title: string;
  description: string;
  price: string;
  category: string;
  subCategory: string;
  originalPrice: string;
  imageCount: number;
}

export function useProductScore(input: ScoreInput): ProductScore {
  return useMemo(() => {
    const breakdown: ScoreBreakdown = {
      images: 0,
      title: 0,
      description: 0,
      price: 0,
      category: 0,
      subCategory: 0,
      originalPrice: 0,
    };

    // Images (30 pts)
    const imgs = input.imageCount;
    breakdown.images = imgs === 0 ? 0 : imgs === 1 ? 10 : imgs === 2 ? 15 : imgs === 3 ? 20 : imgs === 4 ? 25 : 30;

    // Title (15 pts)
    const titleLen = input.title.trim().length;
    breakdown.title = titleLen === 0 ? 0 : titleLen < 10 ? 5 : titleLen < 30 ? 10 : 15;

    // Description (25 pts)
    const descLen = input.description.trim().length;
    breakdown.description = descLen === 0 ? 0 : descLen < 20 ? 5 : descLen < 50 ? 10 : descLen < 100 ? 15 : descLen < 200 ? 20 : 25;

    // Price (10 pts)
    breakdown.price = input.price && Number(input.price) > 0 ? 10 : 0;

    // Category (10 pts)
    breakdown.category = input.category ? 10 : 0;

    // SubCategory (5 pts)
    breakdown.subCategory = input.subCategory ? 5 : 0;

    // Original price (5 pts)
    breakdown.originalPrice = input.originalPrice && Number(input.originalPrice) > 0 ? 5 : 0;

    const total = Object.values(breakdown).reduce((s, v) => s + v, 0);
    const max = 100;
    const percentage = Math.round((total / max) * 100);

    // Suggestions
    const suggestions: string[] = [];
    if (imgs === 0) suggestions.push('Ajoutez au moins une photo pour publier.');
    else if (imgs < 3) suggestions.push('Les produits avec 3+ photos se vendent 2x plus vite.');
    if (titleLen < 10) suggestions.push('Un titre plus descriptif attire plus d\'acheteurs.');
    if (descLen < 50) suggestions.push('Une description detaillee augmente les ventes de 30%.');
    if (!input.category) suggestions.push('Selectionnez une categorie pour etre mieux reference.');
    if (!input.subCategory && input.category) suggestions.push('Ajoutez une sous-categorie pour plus de precision.');
    if (!input.originalPrice && input.price) suggestions.push('Indiquer l\'ancien prix montre la reduction au client.');

    const level: ProductScore['level'] =
      percentage < 40 ? 'poor' :
      percentage < 60 ? 'fair' :
      percentage < 80 ? 'good' : 'excellent';

    const color =
      level === 'poor' ? 'red' :
      level === 'fair' ? 'yellow' :
      level === 'good' ? 'blue' : 'green';

    return { total, max, percentage, breakdown, suggestions, level, color };
  }, [input.title, input.description, input.price, input.category, input.subCategory, input.originalPrice, input.imageCount]);
}
