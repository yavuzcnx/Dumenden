'use client';

import { supabase } from '@/lib/supabaseClient';
import { useI18n } from '@/lib/i18n';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';

type Report = {
  id: string;
  reporter_id?: string | null;
  target_user_id?: string | null;
  target_type: 'comment' | 'coupon' | 'user';
  target_id?: string | null;
  reason?: string | null;
  status: 'pending' | 'resolved' | 'dismissed';
  created_at: string;
  resolved_at?: string | null;
};

export default function AdminReports() {
  const { t } = useI18n();
  const router = useRouter();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'pending' | 'resolved'>('pending');

  const fetchReports = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('ugc_reports')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error) setReports((data ?? []) as Report[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchReports();
  }, []);

  const filtered = useMemo(
    () => reports.filter((r) => (tab === 'pending' ? r.status === 'pending' : r.status !== 'pending')),
    [reports, tab],
  );

  const resolveReport = async (r: Report) => {
    const { data } = await supabase.auth.getUser();
    const uid = data?.user?.id;
    await supabase
      .from('ugc_reports')
      .update({ status: 'resolved', resolved_at: new Date().toISOString(), resolved_by: uid ?? null })
      .eq('id', r.id);
    fetchReports();
  };

  const removeContent = async (r: Report) => {
    if (r.target_type === 'comment' && r.target_id) {
      await supabase.from('comments').delete().eq('id', r.target_id);
    }
    if (r.target_type === 'coupon' && r.target_id) {
      await supabase.from('coupons').update({ is_open: false, archived: true }).eq('id', r.target_id);
    }
  };

  const banUser = async (r: Report) => {
    if (r.target_user_id) {
      await supabase.from('users').update({ is_blocked: true }).eq('id', r.target_user_id);
    }
  };

  const handleRemoveAndBan = async (r: Report) => {
    Alert.alert(
      t('adminReports.confirmTitle'),
      t('adminReports.confirmBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('adminReports.confirmAction'),
          style: 'destructive',
          onPress: async () => {
            try {
              await removeContent(r);
              await banUser(r);
              await resolveReport(r);
              Alert.alert(t('adminReports.doneTitle'), t('adminReports.doneBody'));
            } catch (e: any) {
              Alert.alert(t('common.error'), e?.message ?? t('adminReports.failBody'));
            }
          },
        },
      ],
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>{t('adminReports.title')}</Text>
      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={24} color="#FF6B00" />
      </TouchableOpacity>

      <View style={styles.tabs}>
        <TouchableOpacity
          onPress={() => setTab('pending')}
          style={[styles.tab, tab === 'pending' && styles.tabActive]}
        >
          <Text style={[styles.tabText, tab === 'pending' && styles.tabTextActive]}>
            {t('adminReports.tabs.pending')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setTab('resolved')}
          style={[styles.tab, tab === 'resolved' && styles.tabActive]}
        >
          <Text style={[styles.tabText, tab === 'resolved' && styles.tabTextActive]}>
            {t('adminReports.tabs.resolved')}
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={{ marginTop: 40 }}>
          <ActivityIndicator color="#FF6B00" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={<Text style={styles.empty}>{t('adminReports.empty')}</Text>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.type}>{t(`adminReports.type.${item.target_type}`)}</Text>
                <Text style={styles.status}>{item.status}</Text>
              </View>
              <Text style={styles.reason}>{item.reason || t('common.na')}</Text>
              <Text style={styles.meta}>
                {t('adminReports.reportId')}: {item.target_id || '-'}
              </Text>

              {item.status === 'pending' ? (
                <View style={styles.actions}>
                  <TouchableOpacity onPress={() => resolveReport(item)} style={styles.actionGhost}>
                    <Text style={styles.actionGhostText}>{t('adminReports.resolve')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleRemoveAndBan(item)} style={styles.actionDanger}>
                    <Text style={styles.actionDangerText}>{t('adminReports.removeAndBan')}</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          )}
        />
      )}
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
  backButton: {
    position: 'absolute',
    top: 50,
    left: 20,
    zIndex: 999,
    elevation: 10,
  },
  tabs: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
  },
  tabActive: { backgroundColor: '#FFE7D6' },
  tabText: { fontWeight: '800', color: '#333' },
  tabTextActive: { color: '#FF6B00' },
  empty: { textAlign: 'center', marginTop: 20, color: '#777' },
  card: {
    backgroundColor: '#FAFAFA',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#EEE',
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  type: { fontWeight: '900', color: '#111' },
  status: { color: '#666', fontWeight: '700' },
  reason: { color: '#444', marginBottom: 6 },
  meta: { color: '#777', fontSize: 12 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  actionGhost: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
  },
  actionGhostText: { color: '#111', fontWeight: '800' },
  actionDanger: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
  },
  actionDangerText: { color: '#B91C1C', fontWeight: '900' },
});
