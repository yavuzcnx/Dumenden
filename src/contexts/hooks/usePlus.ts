import { supabase } from "@/lib/supabaseClient";
import { useCallback, useEffect, useState } from "react";

export function usePlus() {
  const [loading, setLoading] = useState(true);
  const [isPlus, setIsPlus] = useState(false);

  // ✅ Listener yok: sadece gerektiğinde check yap
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase.auth.getUser();
      const user = data?.user;

      if (!user) {
        setIsPlus(false);
        return;
      }

      // ✔ metadata'daki dümendenci flag'i
      const flag = user.user_metadata?.dumendenci === true;
      setIsPlus(flag);
    } catch {
      setIsPlus(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { isPlus, loading, refresh };
}
