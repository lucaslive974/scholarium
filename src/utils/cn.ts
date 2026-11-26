import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Composes conditional class names via `clsx` and resolves conflicting
 * Tailwind CSS utility classes via `tailwind-merge`.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
