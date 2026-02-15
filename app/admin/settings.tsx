'use client';

import { supabase } from '@/lib/supabaseClient';
import { useI18n } from '@/lib/i18n';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';


import {
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

export default function AdminSettingsPage() {
  const { t } = useI18n();
  const [users, setUsers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [reportMap, setReportMap] = useState<Record<string, any>>({});
  const router = useRouter();

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    const { data, error } = await supabase.from('users').select('*');
    if (!error) setUsers(data || []);

    const { data: reports } = await supabase
      .from('ugc_reports')
      .select('target_user_id, reason, target_type, target_id, reporter_id, created_at, status')
      .order('created_at', { ascending: false });

    const map: Record<string, any> = {};
    (reports || []).forEach((r: any) => {
      if (!r?.target_user_id) return;
      if (!map[r.target_user_id]) map[r.target_user_id] = r;
    });
    setReportMap(map);
  };

  const handleBlock = async (id: string) => {
    const { error } = await supabase.from('users').update({ is_blocked: true }).eq('id', id);
    if (!error) {
      Alert.alert(t('adminSettings.blockedTitle'));
      fetchUsers();
    }
  };

  const handleUnblock = async (id: string) => {
    const { error } = await supabase.from('users').update({ is_blocked: false }).eq('id', id);
    if (!error) {
      Alert.alert(t('adminSettings.unblockedTitle'));
      fetchUsers();
    }
  };

  const filteredUsers = users.filter((u) =>
    u.full_name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <View style={styles.container}>
      <Text style={styles.header}>{t('adminSettings.title')}</Text>
    <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
      <Ionicons name="arrow-back" size={24} color="#FF6B00" />
    </TouchableOpacity>
      <TextInput
        placeholder={t('adminSettings.searchPlaceholder')}
        value={search}
        onChangeText={setSearch}
        style={styles.searchBar}
      />

      <FlatList
        data={filteredUsers}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.userRow}>
            <View>
              <Text style={styles.userName}>{item.full_name || t('adminSettings.unnamedUser')}</Text>
              <Text style={styles.userEmail}>{item.email}</Text>
              {reportMap[item.id] && (
                <View style={styles.reportBox}>
                  <Text style={styles.reportLine}>
                    {t('adminSettings.reportReason')}: {reportMap[item.id]?.reason || t('common.na')}
                  </Text>
                  <Text style={styles.reportLine}>
                    {t('adminSettings.reportTarget')}: {reportMap[item.id]?.target_type || t('common.na')}
                    {reportMap[item.id]?.target_id ? ` #${reportMap[item.id]?.target_id}` : ''}
                  </Text>
                  <Text style={styles.reportLine}>
                    {t('adminSettings.reportBy')}: {String(reportMap[item.id]?.reporter_id || '').slice(0, 8)}
                  </Text>
                  <Text style={styles.reportLine}>
                    {t('adminSettings.reportAt')}: {reportMap[item.id]?.created_at ? new Date(reportMap[item.id].created_at).toLocaleString() : t('common.na')}
                  </Text>
                </View>
              )}
            </View>
            <TouchableOpacity
              style={[styles.blockButton, { backgroundColor: item.is_blocked ? '#4CAF50' : '#E53935' }]}
              onPress={() => (item.is_blocked ? handleUnblock(item.id) : handleBlock(item.id))}
            >
              <Text style={{ color: '#fff' }}>{item.is_blocked ? t('adminSettings.unblockAction') : t('adminSettings.blockAction')}</Text>
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={<Text style={{ textAlign: 'center', marginTop: 20 }}>{t('adminSettings.empty')}</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#fff' },
  header: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#FF6B00',
    textAlign: 'center',
  },
  searchBar: {
    backgroundColor: '#f0f0f0',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  userRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    backgroundColor: '#FAFAFA',
    borderRadius: 10,
    marginBottom: 12,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
  },
  userEmail: {
    fontSize: 13,
    color: '#666',
  },
  reportBox: {
    marginTop: 6,
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  reportLine: { fontSize: 12, color: '#7C2D12', fontWeight: '600' },
  blockButton: {
    padding: 10,
    borderRadius: 8,
  },
     backButton: {
  position: 'absolute',
  top: 50,
  left: 20,
  zIndex: 999,
  elevation: 10,
},
});
