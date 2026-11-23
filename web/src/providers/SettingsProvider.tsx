import React, { createContext, useContext, useState, useEffect } from 'react';
import { useApp } from './AppProvider';

interface SettingsData {
  custom_domain: string;
  default_access_type: 'public' | 'ip_whitelist' | 'private';
  global_allowed_ips: string;
  global_blocked_ips: string;
  api_key: string;
}

interface StatsData {
  total_files: number;
  total_folders: number;
  total_images: number;
  total_size_bytes: number;
  client_ip: string;
}

function useSettingsState() {
  const { token, setToken, showToast } = useApp();
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);

  // 配置状态
  const [customDomain, setCustomDomain] = useState<string>('');
  const [defaultAccessType, setDefaultAccessType] = useState<'public' | 'ip_whitelist' | 'private'>('public');
  const [globalAllowedIPs, setGlobalAllowedIPs] = useState<string>('');
  const [globalBlockedIPs, setGlobalBlockedIPs] = useState<string>('');
  const [apiKey, setApiKey] = useState<string>('');
  const [stats, setStats] = useState<StatsData | null>(null);

  useEffect(() => {
    fetchSettings();
  }, [token]);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/settings', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.status === 401) {
        setToken('');
        return;
      }
      if (res.ok) {
        const data = await res.json();
        const s: SettingsData = data.settings;
        setCustomDomain(s.custom_domain || '');
        setDefaultAccessType(s.default_access_type || 'public');
        setGlobalAllowedIPs(s.global_allowed_ips || '');
        setGlobalBlockedIPs(s.global_blocked_ips || '');
        setApiKey(s.api_key || '');
        setStats(data.stats);
      }
    } catch {
      showToast('获取系统配置失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveGeneral = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          custom_domain: customDomain,
          default_access_type: defaultAccessType
        })
      });
      if (res.ok) {
        showToast('常规配置已保存');
      } else {
        showToast('保存失败');
      }
    } catch {
      showToast('请求出错');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSecurity = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          global_allowed_ips: globalAllowedIPs,
          global_blocked_ips: globalBlockedIPs
        })
      });
      if (res.ok) {
        showToast('安全与 IP 策略已保存');
      } else {
        showToast('保存失败');
      }
    } catch {
      showToast('请求出错');
    } finally {
      setSaving(false);
    }
  };

  const handleRegenerateKey = async () => {
    if (!confirm('确定要重新生成 API Key 吗？已有使用旧 Key 的客户端将无法继续访问。')) return;
    try {
      const res = await fetch('/api/settings/apikey/regenerate', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setApiKey(data.api_key);
        showToast('API Key 已重新生成');
      }
    } catch {
      showToast('重新生成失败');
    }
  };

  const formatSize = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    showToast(`已拷贝 ${label}`);
  };

  const picGoConfigJson = JSON.stringify(
    {
      picBed: {
        current: "custom",
        custom: {
          url: `${customDomain || window.location.origin}/api/items/upload`,
          paramName: "files",
          jsonPath: "uploaded[0].id",
          customHeader: apiKey ? `{"X-API-Key": "${apiKey}"}` : `{"Authorization": "Bearer ${token}"}`
        }
      }
    },
    null,
    2
  );

  return {
    loading,
    saving,
    customDomain,
    setCustomDomain,
    defaultAccessType,
    setDefaultAccessType,
    globalAllowedIPs,
    setGlobalAllowedIPs,
    globalBlockedIPs,
    setGlobalBlockedIPs,
    apiKey,
    stats,
    handleSaveGeneral,
    handleSaveSecurity,
    handleRegenerateKey,
    formatSize,
    copyToClipboard,
    picGoConfigJson,
  };
}

const SettingsContext = createContext<ReturnType<typeof useSettingsState> | null>(null);
export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const value = useSettingsState();
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}
export function useSettings() {
  const value = useContext(SettingsContext);
  if (!value) throw new Error('useSettings requires SettingsProvider');
  return value;
}
