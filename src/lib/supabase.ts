/**
 * @file Supabase 客户端初始化
 * @description 配置并导出 Supabase 客户端实例
 */
import { createClient } from '@supabase/supabase-js';

// Supabase 项目配置
const SUPABASE_URL = 'https://knjzkfiyzewmqkncbhmr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtuanprZml5emV3bXFrbmNiaG1yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUxNzk3NzAsImV4cCI6MjA4MDc1NTc3MH0.ux-v9V6zI-EkkNgAibrcwr0pvAg9iF1Sk4qLFSkl5Yc';

// 创建 Supabase 客户端
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
    },
});

// 导出配置供其他模块使用
export const SUPABASE_CONFIG = {
    url: SUPABASE_URL,
    anonKey: SUPABASE_ANON_KEY,
};
