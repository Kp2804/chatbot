/**
 * @file utils.ts
 * @description Core utility functions used across the application.
 * 
 * Includes `cn` for combining Tailwind CSS classes conditionally without style conflicts.
 */
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
