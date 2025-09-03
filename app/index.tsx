import { useRouter } from 'expo-router';
import { useEffect } from 'react';

export default function Index() {
  const router = useRouter();

  useEffect(() => {
    const t = setTimeout(() => {
      router.replace('/splash'); // sadece splash'a geçir (geri gelinmez)
    }, 50);
    return () => clearTimeout(t);
  }, [router]);

  return null;
}
