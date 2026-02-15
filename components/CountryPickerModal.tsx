import { Ionicons } from '@expo/vector-icons';
import Modal from 'react-native-modal';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { COUNTRIES, CountryCode, flagEmoji } from '@/lib/countries';
import { useI18n } from '@/lib/i18n';

type Props = {
  visible: boolean;
  value: CountryCode;
  onClose: () => void;
  onSelect: (code: CountryCode) => void;
};

const ORANGE = '#FF6B00';

export default function CountryPickerModal({ visible, value, onClose, onSelect }: Props) {
  const { t } = useI18n();

  return (
    <Modal
      isVisible={visible}
      onBackdropPress={onClose}
      onBackButtonPress={onClose}
      backdropOpacity={0.35}
      style={styles.modal}
      useNativeDriver
    >
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <Text style={styles.title}>{t('countryPicker.title')}</Text>

        <ScrollView style={{ maxHeight: 360 }}>
          {COUNTRIES.map((c) => {
            const selected = c.code === value;
            return (
              <TouchableOpacity
                key={c.code}
                onPress={() => onSelect(c.code)}
                activeOpacity={0.85}
                style={[styles.row, selected && styles.rowActive]}
              >
                <Text style={styles.flag}>{flagEmoji(c.code)}</Text>
                <Text style={styles.name}>{t(c.nameKey)}</Text>
                {selected ? <Ionicons name="checkmark-circle" size={20} color={ORANGE} /> : null}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.85}>
          <Text style={styles.closeTxt}>{t('common.close')}</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modal: { justifyContent: 'flex-end', margin: 0 },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 16,
    paddingBottom: 24,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 8,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 999,
    backgroundColor: '#E5E7EB',
    marginBottom: 10,
  },
  title: { fontSize: 16, fontWeight: '900', color: '#111' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f1f1',
  },
  rowActive: { backgroundColor: '#FFF7F1' },
  flag: { fontSize: 20 },
  name: { flex: 1, fontWeight: '800', color: '#222' },
  closeBtn: {
    marginTop: 12,
    backgroundColor: '#F3F4F6',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  closeTxt: { fontWeight: '800', color: '#111' },
});

