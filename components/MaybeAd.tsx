// components/MaybeAd.tsx
import { usePlus } from '@/src/contexts/hooks/usePlus';
import React from 'react';
import { View } from 'react-native';

export default function MaybeAd({ children }: { children: React.ReactNode }) {
  const { isPlus } = usePlus();
  if (isPlus) return null;
  return <View style={{ marginVertical: 8 }}>{children}</View>;
}
