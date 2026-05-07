import { z } from 'zod';

// ─── Price Form ───
export const priceSchema = z.object({
  category: z.enum(['demobox', 'clothing', 'toolkit', 'other']),
  item_name: z.string().trim().min(1, 'Item name is required').max(100, 'Max 100 characters'),
  price: z.number({ error: 'Price must be a number' }).min(0, 'Price must be positive').max(99999, 'Price too high'),
});

// ─── Phone Model Form ───
export const phoneModelSchema = z.object({
  name: z.string().trim().min(1, 'Model name is required').max(100, 'Max 100 characters'),
  price: z.number({ error: 'Price must be a number' }).min(0, 'Price must be positive').max(99999, 'Price too high'),
  price_confirmed: z.boolean(),
});

// ─── Tablet Model Form ───
export const tabletModelSchema = z.object({
  name: z.string().trim().min(1, 'Model name is required').max(100, 'Max 100 characters'),
  price: z.number({ error: 'Price must be a number' }).min(0, 'Price must be positive').max(99999, 'Price too high'),
  price_confirmed: z.boolean(),
});

// ─── User Creation Form ───
export const createUserSchema = z.object({
  email: z.string().trim().email('Invalid email address').max(255),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  full_name: z.string().trim().min(1, 'Full name is required').max(100, 'Max 100 characters'),
  role: z.enum(['admin', 'data_manager', 'sbc']),
  branch_id: z.string().optional(),
});

// ─── People Form ───
export const personSchema = z.object({
  pers_id: z.string().trim().min(1, 'Pers ID is required').max(50),
  sales_id: z.string().trim().min(1, 'Sales ID is required').max(50),
  sales_name: z.string().trim().min(1, 'Sales name is required').max(200),
  branch_id: z.string().optional(),
  sales_channel_start: z.string().optional(),
});

// ─── Equipment Transaction Validation ───
export const equipmentTransactionSchema = z.object({
  person_id: z.string().uuid('Invalid person'),
  transaction_type: z.enum(['Uitgifte', 'Ingeleverd']),
  has_equipment: z.boolean().refine(v => v, 'At least one equipment item must be selected'),
  employee_signature: z.string().min(1, 'Employee signature is required'),
  sbc_signature: z.string().min(1, 'SBC signature is required'),
});

// Max signature size: 150KB in base64
export const MAX_SIGNATURE_SIZE = 150 * 1024;

export function validateSignatureSize(sig: string): boolean {
  return sig.length <= MAX_SIGNATURE_SIZE;
}

// ─── Validation helper ───
export type ValidationResult<T> = { success: true; data: T } | { success: false; error: string };

export function validateForm<T>(schema: z.ZodType<T>, data: unknown): ValidationResult<T> {
  const result = schema.safeParse(data);
  if (result.success) return { success: true, data: result.data };
  const firstIssue = result.error.issues?.[0];
  const msg = firstIssue?.message || 'Validation error';
  return { success: false, error: msg };
}
