import { supabase } from '@/lib/supabaseClient'
import { AntDesign } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import {
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native'

export default function RegisterPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const [rules, setRules] = useState({
    length: false,
    upper: false,
    lower: false,
    number: false,
    special: false,
  })

  useEffect(() => {
    setRules({
      length: password.length >= 8,
      upper: /[A-Z]/.test(password),
      lower: /[a-z]/.test(password),
      number: /[0-9]/.test(password),
      special: /[^A-Za-z0-9]/.test(password),
    })
  }, [password])

  const formatBirthDate = (text: string) => {
    const cleaned = text.replace(/\D/g, '')
    let formatted = cleaned
    if (cleaned.length > 4) formatted = cleaned.slice(0, 4) + '.' + cleaned.slice(4)
    if (cleaned.length > 6) formatted = formatted.slice(0, 7) + '.' + cleaned.slice(6, 8)
    setBirthDate(formatted)
  }

  const handleRegister = async () => {
    setError('')
    if (password !== confirmPassword) {
      return setError('Şifreler uyuşmuyor.')
    }

    // Kayıt işlemi
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
    })

    if (signUpError) return setError(signUpError.message)

    const userId = data.user?.id || data.session?.user.id
    console.log("Kayıt olan userId:", userId)

    console.log('User ID (auth.uid()):', userId)
    if (!userId) return setError('Kullanıcı oluşturulamadı.')

    // Kullanıcı profili oluştur (upsert ile tekrar eklenmeyecek)
    const { error: insertError } = await supabase.from('users').upsert([
      {
        id: userId,
        full_name: fullName,
        phone_number: phone,
        birth_date: birthDate,
      },
    ])

    if (insertError) return setError(insertError.message)

    setSuccess(true)
    setTimeout(() => router.replace('/login'), 3000)
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.wrapper}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.container}>
          <Image source={require('../assets/images/logo.png')} style={styles.logo} />
          <Text style={styles.title}>Kayıt Ol</Text>

          {success ? (
            <Text style={styles.success}>Tebrikler! Kaydınız başarıyla oluşturuldu.</Text>
          ) : (
            <>
              <TextInput placeholder="Ad Soyad" value={fullName} onChangeText={setFullName} style={styles.input} />
              <TextInput placeholder="Telefon" value={phone} onChangeText={setPhone} style={styles.input} keyboardType="phone-pad" />
              <TextInput
                placeholder="Doğum Tarihi (YYYY.MM.DD)"
                value={birthDate}
                onChangeText={formatBirthDate}
                style={styles.input}
                keyboardType="numeric"
                maxLength={10}
              />
              <TextInput placeholder="E-posta" value={email} onChangeText={setEmail} style={styles.input} keyboardType="email-address" />
              <TextInput placeholder="Şifre" value={password} onChangeText={setPassword} style={styles.input} secureTextEntry />
              <TextInput placeholder="Şifre Tekrar" value={confirmPassword} onChangeText={setConfirmPassword} style={styles.input} secureTextEntry />

              <View style={{ marginBottom: 10 }}>
                <Text style={rules.length ? styles.valid : styles.invalid}>• En az 8 karakter</Text>
                <Text style={rules.upper ? styles.valid : styles.invalid}>• Büyük harf</Text>
                <Text style={rules.lower ? styles.valid : styles.invalid}>• Küçük harf</Text>
                <Text style={rules.number ? styles.valid : styles.invalid}>• Rakam</Text>
                <Text style={rules.special ? styles.valid : styles.invalid}>• Özel karakter (!@#)</Text>
              </View>

              {error ? <Text style={styles.error}>{error}</Text> : null}
              <TouchableOpacity
                style={[styles.button, !(rules.length && rules.upper && rules.lower && rules.number && rules.special) && { opacity: 0.5 }]}
                onPress={handleRegister}
                disabled={!(rules.length && rules.upper && rules.lower && rules.number && rules.special)}
              >
                <Text style={styles.buttonText}>Kayıt Ol</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.googleButton}>
                <AntDesign name="google" size={20} color="#444" style={{ marginRight: 8 }} />
                <Text style={styles.googleText}>Google ile Kayıt Ol</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => router.replace('/login')}>
                <Text style={styles.link}>Zaten hesabın var mı? Giriş Yap</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  wrapper: { flex: 1 },
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#fff' },
  logo: { width: 100, height: 100, alignSelf: 'center', marginBottom: 20 },
  title: { fontSize: 26, fontWeight: 'bold', textAlign: 'center', marginBottom: 20 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    fontSize: 16,
    backgroundColor: '#f9f9f9',
  },
  button: {
    backgroundColor: '#FF6B00',
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
  link: {
    marginTop: 20,
    textAlign: 'center',
    color: '#0066cc',
    fontSize: 14,
  },
  error: { color: 'red', textAlign: 'center', marginBottom: 10 },
  success: { color: 'green', textAlign: 'center', marginBottom: 20, fontSize: 16 },
  valid: { color: 'green', fontSize: 14 },
  invalid: { color: 'gray', fontSize: 14 },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: '#ccc',
    borderWidth: 1,
    padding: 12,
    borderRadius: 12,
    marginTop: 16,
  },
  googleText: {
    color: '#444',
    fontSize: 15,
    fontWeight: '500',
  },
})
