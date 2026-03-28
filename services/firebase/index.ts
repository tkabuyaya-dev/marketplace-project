/**
 * NUNULIA — Firebase Service Layer (Barrel Export)
 *
 * Re-exports all modules for backward compatibility.
 * Import from 'services/firebase' works exactly as before.
 *
 * For new code, prefer importing from specific modules:
 *   import { signInWithGoogle } from '../services/firebase/auth';
 *   import { getProducts } from '../services/firebase/products';
 */

export * from './auth';
export * from './products';
export * from './users';
export * from './likes';
export * from './notifications';
export * from './reviews';
export * from './activity';
export * from './admin-data';
export * from './subscription-requests';
export * from './auctions';
