// lib/supabaseClient.ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://hgvvrrkeljasjwdoajtw.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhndnZycmtlbGphc2p3ZG9hanR3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIyMzQyNjMsImV4cCI6MjA2NzgxMDI2M30.F7o5jWKglt8eRyTf5xnpKVdNt4Rpb_R9CarArze_QcA'

export const supabase = createClient(supabaseUrl, supabaseKey)
