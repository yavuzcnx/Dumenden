import { useI18n } from '@/lib/i18n'
import { useRouter } from 'expo-router'
import { useEffect } from 'react'
import { Image, StyleSheet, Text, View } from 'react-native'

export default function SplashScreen() {
  const router = useRouter()
  const { t } = useI18n()

  useEffect(() => {
    const timer = setTimeout(() => {
      router.replace('/login') // 2 saniye sonra login sayfasına geç
    }, 2000)

    return () => clearTimeout(timer)
  }, [])

  return (
    <View style={styles.container}>
      <Image source={require('../assets/images/logo.png')} style={styles.logo} />
      <Text style={styles.text}>{t('common.loading')}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 120,
    height: 120,
    resizeMode: 'contain',
    marginBottom: 20,
  },
  text: {
    fontSize: 16,
    color: '#666',
  },
})
