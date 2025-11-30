import { supabase } from "@/lib/supabaseClient";
import { useEffect, useState } from "react";

export function usePlus() {
  const [loading, setLoading] = useState(true);
  const [isPlus, setIsPlus] = useState(false);

  useEffect(() => {
    let sub: any = null;

    const check = async () => {
      setLoading(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setIsPlus(false);
        setLoading(false);
        return;
      }

      // ✔ metadata'daki dümendenci flag'i
      const flag = user.user_metadata?.dumendenci === true;
      setIsPlus(flag);

      setLoading(false);
    };

    check();

    // ✔ giriş/çıkış eventlerini dinle
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user;
      const flag = u?.user_metadata?.dumendenci === true;
      setIsPlus(flag);
    });

    sub = data;

    return () => {
      try { sub?.subscription?.unsubscribe(); } catch {}
    };
  }, []);

  return { isPlus, loading };
}
