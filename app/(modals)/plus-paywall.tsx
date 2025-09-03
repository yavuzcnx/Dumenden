import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

export default function PlusPaywall() {
  const r = useRouter();
  return (
    <View style={{ flex:1, backgroundColor:'rgba(0,0,0,0.5)', alignItems:'center', justifyContent:'center' }}>
      <View style={{ backgroundColor:'#fff', borderRadius:16, padding:20, width:'86%' }}>
        <Text style={{ fontSize:20, fontWeight:'900', color:'#FF6B00' }}>Dümenci Plus</Text>
        <Text style={{ marginTop:8 }}>
          • Sınırsız kupon ekleme{'\n'}• Öne çıkma şansı{'\n'}• İstatistiklere erişim
        </Text>
        <Pressable onPress={() => r.back()} style={{ marginTop:16, padding:12, backgroundColor:'#FF6B00', borderRadius:12, alignItems:'center' }}>
          <Text style={{ color:'#fff', fontWeight:'800' }}>Kapat</Text>
        </Pressable>
      </View>
    </View>
  );
}
