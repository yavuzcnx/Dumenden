import { supabase } from '@/lib/supabaseClient';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';

export type PurchaseContact = {
  full_name: string;
  email?: string;
  phone: string;
  address: string;
  note?: string;
};

export async function buyItem(
  userId: string,
  rewardId: string,
  priceXp: number,
  contact: PurchaseContact,
  idemKey?: string,
  qty: number = 1
) {
  const key = idemKey ?? uuidv4();

  const { data, error } = await supabase.rpc('purchase_reward', {
    p_user_id:   userId,
    p_reward_id: rewardId,
    p_price_xp:  priceXp,
    p_contact:   contact as any,
    p_idem_key:  key,
    p_qty:       qty,
  });

  if (error) throw error;

  // Supabase RPC table-return format
  const purchaseId =
    Array.isArray(data) ? (data[0]?.purchase_id as string) : (data as any)?.purchase_id;

  return { purchase_id: purchaseId, idem_key: key };
}
