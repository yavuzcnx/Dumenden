import { useRouter } from 'expo-router';
import { useEffect } from 'react';

export default function Index() {
  const router = useRouter();

  useEffect(() => {
    // Uygulama açılınca çok kısa bekleyip Splash ekranına atıyoruz.
    // _layout.tsx içindeki Auth kontrolü, eğer kullanıcı giriş yapmışsa
    // zaten araya girip Home'a yönlendirecektir.
    const t = setTimeout(() => {
      router.replace('/splash'); 
    }, 50);

    return () => clearTimeout(t);
  }, []);

  return null;
}