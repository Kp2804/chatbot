import type { SupabaseClient } from '@supabase/supabase-js';

async function incrementUsageField(
  supabaseAdmin: SupabaseClient,
  userId: string,
  rpcName: 'increment_messages_used' | 'increment_bots_created',
  amount: number
): Promise<void> {
  if (!userId) {
    throw new Error('userId is required for usage tracking');
  }

  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error('amount must be a positive integer');
  }

  const { error } = await supabaseAdmin.rpc(rpcName, {
    target_user_id: userId,
    increment_by: amount,
  });

  if (error) {
    throw new Error(`Usage RPC ${rpcName} failed: ${error.message}`);
  }
}

export async function incrementMessages(
  supabaseAdmin: SupabaseClient,
  userId: string,
  amount = 1
): Promise<void> {
  await incrementUsageField(supabaseAdmin, userId, 'increment_messages_used', amount);
}

export async function incrementBots(
  supabaseAdmin: SupabaseClient,
  userId: string,
  amount = 1
): Promise<void> {
  await incrementUsageField(supabaseAdmin, userId, 'increment_bots_created', amount);
}
