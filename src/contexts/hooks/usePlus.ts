// src/contexts/hooks/usePlus.ts
import { useXp } from '@/src/contexts/hooks/useXp';

export function usePlus() {
  const { xp, loading, refreshXp } = useXp();
  const isPlus = (xp ?? 0) > 0;
  return { isPlus, loading, refreshXp };
}
export default usePlus;
