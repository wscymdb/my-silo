import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Globe,
  Shield,
  Key,
  HardDrive,
  Lock,
  Copy,
  RefreshCw,
  CheckCircle2,
  Radio,
  Edit3,
  Check,
  X
} from 'lucide-react';

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

interface PortItem {
  port: number;
  protocol: string;
  type: 'docker' | 'system';
  name: string;
  detail: string;
  status: string;
  note: string;
}

interface SettingsProps {
  token: string;
  onBack: () => void;
  showToast: (msg: string) => void;
}

export default function Settings({ token, onBack, showToast }: SettingsProps) {
  const [activeTab, setActiveTab] = useState<'general' | 'security' | 'ports' | 'api' | 'storage' | 'account'>('general');
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);

  // 配置状态
  const [customDomain, setCustomDomain] = useState<string>('');
  const [defaultAccessType, setDefaultAccessType] = useState<'public' | 'ip_whitelist' | 'private'>('public');
  const [globalAllowedIPs, setGlobalAllowedIPs] = useState<string>('');
  const [globalBlockedIPs, setGlobalBlockedIPs] = useState<string>('');
  const [apiKey, setApiKey] = useState<string>('');
  const [stats, setStats] = useState<StatsData | null>(null);

  // 端口雷达状态
  const [ports, setPorts] = useState<PortItem[]>([]);
  const [recommendedPorts, setRecommendedPorts] = useState<number[]>([]);
  const [portsLoading, setPortsLoading] = useState<boolean>(false);
  const [editingPort, setEditingPort] = useState<number | null>(null);
  const [editingNote, setEditingNote] = useState<string>('');

  // 密码修改
  const [oldPassword, setOldPassword] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [changingPass, setChangingPass] = useState<boolean>(false);

  useEffect(() => {
    fetchSettings();
  }, [token]);

  useEffect(() => {
    if (activeTab === 'ports') {
      fetchPorts();
    }
  }, [activeTab]);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/settings', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.status === 401) {
        localStorage.removeItem('silo_token');
        window.location.href = '/';
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

  const fetchPorts = async () => {
    setPortsLoading(true);
    try {
      const res = await fetch('/api/system/ports', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.status === 401) {
        localStorage.removeItem('silo_token');
        window.location.href = '/';
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setPorts(data.ports || []);
        setRecommendedPorts(data.recommended_ports || []);
      }
    } catch {
      showToast('探测端口状态失败');
    } finally {
      setPortsLoading(false);
    }
  };

  const handleSavePortNote = async (port: number) => {
    try {
      const res = await fetch(`/api/system/ports/${port}/note`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ note: editingNote })
      });
      if (res.ok) {
        showToast('备忘已保存');
        setEditingPort(null);
        fetchPorts();
      } else {
        showToast('保存失败');
      }
    } catch {
      showToast('请求出错');
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

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      showToast('两次输入的新密码不一致');
      return;
    }
    if (newPassword.length < 6) {
      showToast('新密码长度至少需要 6 位');
      return;
    }
    setChangingPass(true);
    try {
      const res = await fetch('/api/settings/password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          old_password: oldPassword,
          new_password: newPassword
        })
      });
      const data = await res.json();
      if (res.ok) {
        showToast('密码修改成功');
        setOldPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        showToast(data.error || '密码修改失败');
      }
    } catch {
      showToast('修改异常');
    } finally {
      setChangingPass(false);
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

  return (
    <div className="min-h-screen w-full bg-white flex flex-col font-sans text-zinc-950 selection:bg-zinc-900 selection:text-white">
      {/* 顶部通栏 Navbar */}
      <header className="h-14 border-b border-zinc-200/80 px-6 flex items-center justify-between bg-white sticky top-0 z-20">
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="p-1 -ml-1 text-zinc-400 hover:text-zinc-900 transition-colors flex items-center justify-center cursor-pointer"
            title="返回文件库"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-semibold text-zinc-900">系统设置</span>
        </div>
      </header>

      {/* 主体设置双栏布局 (shadcn 标准 Settings 布局) */}
      <div className="flex-1 max-w-6xl w-full mx-auto p-6 md:p-8 flex flex-col md:flex-row gap-8">
        {/* 左侧分类导航菜单 */}
        <aside className="w-full md:w-56 shrink-0">
          <nav className="flex md:flex-col gap-1 overflow-x-auto pb-2 md:pb-0">
            <button
              onClick={() => setActiveTab('general')}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-xs font-medium transition-colors text-left ${
                activeTab === 'general'
                  ? 'bg-zinc-100 text-zinc-950 font-semibold'
                  : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50'
              }`}
            >
              <Globe className="w-3.5 h-3.5 shrink-0" />
              常规与外链
            </button>
            <button
              onClick={() => setActiveTab('ports')}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-xs font-medium transition-colors text-left ${
                activeTab === 'ports'
                  ? 'bg-zinc-100 text-zinc-950 font-semibold'
                  : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50'
              }`}
            >
              <Radio className="w-3.5 h-3.5 shrink-0" />
              服务与端口雷达
            </button>
            <button
              onClick={() => setActiveTab('security')}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-xs font-medium transition-colors text-left ${
                activeTab === 'security'
                  ? 'bg-zinc-100 text-zinc-950 font-semibold'
                  : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50'
              }`}
            >
              <Shield className="w-3.5 h-3.5 shrink-0" />
              安全与 IP 策略
            </button>
            <button
              onClick={() => setActiveTab('api')}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-xs font-medium transition-colors text-left ${
                activeTab === 'api'
                  ? 'bg-zinc-100 text-zinc-950 font-semibold'
                  : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50'
              }`}
            >
              <Key className="w-3.5 h-3.5 shrink-0" />
              API 凭证 & 图床
            </button>
            <button
              onClick={() => setActiveTab('storage')}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-xs font-medium transition-colors text-left ${
                activeTab === 'storage'
                  ? 'bg-zinc-100 text-zinc-950 font-semibold'
                  : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50'
              }`}
            >
              <HardDrive className="w-3.5 h-3.5 shrink-0" />
              存储状态
            </button>
            <button
              onClick={() => setActiveTab('account')}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-xs font-medium transition-colors text-left ${
                activeTab === 'account'
                  ? 'bg-zinc-100 text-zinc-950 font-semibold'
                  : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50'
              }`}
            >
              <Lock className="w-3.5 h-3.5 shrink-0" />
              账户与密码
            </button>
          </nav>
        </aside>

        {/* 右侧表单内容区 */}
        <main className="flex-1 max-w-2xl">
          {loading ? (
            <div className="h-64 flex items-center justify-center text-xs text-zinc-400">
              载入设置中...
            </div>
          ) : (
            <>
              {/* ================= Tab 1: 常规与外链 ================= */}
              {activeTab === 'general' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-base font-semibold text-zinc-900 leading-none">常规与外链域名</h3>
                    <p className="text-xs text-zinc-500 mt-1.5">配置公网访问外链的生成地址与默认策略。</p>
                  </div>

                  <form onSubmit={handleSaveGeneral} className="space-y-5">
                    <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-2xs space-y-4">
                      <div>
                        <label className="block text-xs font-medium text-zinc-800 mb-1">
                          公网外链域名 (Base URL)
                        </label>
                        <input
                          type="text"
                          placeholder="例如: https://silo.yourdomain.com"
                          value={customDomain}
                          onChange={e => setCustomDomain(e.target.value)}
                          className="flex h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-xs shadow-2xs transition-colors placeholder:text-zinc-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950"
                        />
                        <p className="text-[11px] text-zinc-500 mt-1.5">
                          生成直链或 Markdown 语法时自动拼接此域名。留空则自动跟随当前浏览器访问地址。
                        </p>
                      </div>

                      <div className="pt-2 border-t border-zinc-100">
                        <label className="block text-xs font-medium text-zinc-800 mb-2">
                          默认上传访问策略
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          {(['public', 'ip_whitelist', 'private'] as const).map(type => (
                            <label
                              key={type}
                              className={`flex items-center gap-2 p-2.5 rounded-md border text-xs cursor-pointer transition-colors ${
                                defaultAccessType === type
                                  ? 'border-zinc-900 bg-zinc-50 font-medium text-zinc-950'
                                  : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50'
                              }`}
                            >
                              <input
                                type="radio"
                                name="defaultAccess"
                                value={type}
                                checked={defaultAccessType === type}
                                onChange={() => setDefaultAccessType(type)}
                                className="accent-zinc-900"
                              />
                              <span>
                                {type === 'public' && '全公开'}
                                {type === 'ip_whitelist' && 'IP 白名单'}
                                {type === 'private' && '仅私有'}
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={saving}
                        className="inline-flex h-8 items-center justify-center rounded-md bg-zinc-900 px-4 text-xs font-medium text-zinc-50 shadow-xs hover:bg-zinc-900/90 transition-colors disabled:opacity-50"
                      >
                        {saving ? '保存中...' : '保存更改'}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* ================= Tab 2: 服务与端口雷达 ================= */}
              {activeTab === 'ports' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-semibold text-zinc-900 leading-none">服务与端口雷达</h3>
                      <p className="text-xs text-zinc-500 mt-1.5">
                        自动汇聚 Docker 容器应用与宿主机系统原生端口，支持为每个端口添加备忘录。
                      </p>
                    </div>
                    <button
                      onClick={fetchPorts}
                      disabled={portsLoading}
                      className="inline-flex h-8 px-2.5 items-center justify-center rounded-md border border-zinc-200 bg-white text-xs font-medium text-zinc-700 hover:bg-zinc-100 transition-colors gap-1.5 shadow-2xs disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${portsLoading ? 'animate-spin' : ''}`} />
                      刷新探测
                    </button>
                  </div>

                  {/* 推荐空闲端口卡片 */}
                  {recommendedPorts.length > 0 && (
                    <div className="rounded-lg border border-emerald-200/80 bg-emerald-50/50 p-4 shadow-2xs">
                      <div className="text-xs font-semibold text-emerald-900 mb-1.5 flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        推荐可用的安全空闲端口（避开冲突）：
                      </div>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {recommendedPorts.map(p => (
                          <button
                            key={p}
                            onClick={() => copyToClipboard(String(p), `端口号 ${p}`)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white border border-emerald-300 text-xs font-mono font-medium text-emerald-800 hover:bg-emerald-100/60 shadow-2xs transition-colors"
                            title="点击快速复制"
                          >
                            <span>{p}</span>
                            <Copy className="w-3 h-3 text-emerald-600 opacity-60" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 端口占用表格 */}
                  <div className="rounded-md border border-zinc-200 overflow-hidden bg-white shadow-2xs">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-zinc-50/60 border-b border-zinc-200 text-zinc-500 font-medium">
                        <tr>
                          <th className="py-2.5 px-3 font-medium">端口</th>
                          <th className="py-2.5 px-3 font-medium">来源/类型</th>
                          <th className="py-2.5 px-3 font-medium">应用/容器名称</th>
                          <th className="py-2.5 px-3 font-medium">协议</th>
                          <th className="py-2.5 px-3 font-medium">我的备忘</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {portsLoading ? (
                          <tr>
                            <td colSpan={5} className="py-8 text-center text-zinc-400">
                              正在扫描服务器应用与端口...
                            </td>
                          </tr>
                        ) : ports.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="py-8 text-center text-zinc-400">
                              暂未探测到活跃监听端口
                            </td>
                          </tr>
                        ) : (
                          ports.map(p => (
                            <tr key={`${p.port}-${p.protocol}`} className="hover:bg-zinc-50/70 transition-colors">
                              <td className="py-2.5 px-3 font-mono font-semibold text-zinc-900">
                                <span className="px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-900">
                                  {p.port}
                                </span>
                              </td>
                              <td className="py-2.5 px-3">
                                {p.type === 'docker' ? (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200/60">
                                    Docker 容器
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-zinc-100 text-zinc-600 border border-zinc-200/60">
                                    系统原生
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 font-medium text-zinc-800">
                                <div className="truncate max-w-[140px]" title={p.name}>
                                  {p.name}
                                </div>
                                {p.detail && (
                                  <div className="text-[10px] text-zinc-400 font-mono truncate max-w-[140px]" title={p.detail}>
                                    {p.detail}
                                  </div>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-zinc-500 font-mono text-[11px]">
                                {p.protocol}
                              </td>
                              <td className="py-2.5 px-3">
                                {editingPort === p.port ? (
                                  <div className="flex items-center gap-1.5">
                                    <input
                                      type="text"
                                      autoFocus
                                      value={editingNote}
                                      onChange={e => setEditingNote(e.target.value)}
                                      placeholder="例如：博客、听雨3D"
                                      className="h-7 w-36 px-2 text-xs border rounded bg-white border-zinc-300 focus:outline-none focus:ring-1 focus:ring-zinc-950"
                                      onKeyDown={e => {
                                        if (e.key === 'Enter') handleSavePortNote(p.port);
                                        if (e.key === 'Escape') setEditingPort(null);
                                      }}
                                    />
                                    <button
                                      onClick={() => handleSavePortNote(p.port)}
                                      className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                                      title="保存"
                                    >
                                      <Check className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() => setEditingPort(null)}
                                      className="p-1 text-zinc-400 hover:bg-zinc-100 rounded"
                                      title="取消"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                ) : (
                                  <div
                                    onClick={() => {
                                      setEditingPort(p.port);
                                      setEditingNote(p.note || '');
                                    }}
                                    className="flex items-center gap-1 group/note cursor-pointer py-1"
                                    title="点击编辑备忘"
                                  >
                                    <span className={`truncate max-w-[130px] ${p.note ? 'text-zinc-800 font-medium' : 'text-zinc-300 italic'}`}>
                                      {p.note || '点击添加备注...'}
                                    </span>
                                    <Edit3 className="w-3 h-3 text-zinc-400 opacity-0 group-hover/note:opacity-100 transition-opacity" />
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ================= Tab 3: 安全与 IP 策略 ================= */}
              {activeTab === 'security' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-base font-semibold text-zinc-900 leading-none">安全与全局 IP 控制</h3>
                    <p className="text-xs text-zinc-500 mt-1.5">配置全站通用的 IP 白名单与恶意 IP 拦截黑名单。</p>
                  </div>

                  <form onSubmit={handleSaveSecurity} className="space-y-5">
                    <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-2xs space-y-4">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs font-medium text-zinc-800">
                            全局 IP 白名单 (Global Allowed IPs)
                          </label>
                          {stats?.client_ip && (
                            <button
                              type="button"
                              onClick={() => {
                                const ips = globalAllowedIPs ? globalAllowedIPs.split(',').map(s => s.trim()) : [];
                                if (!ips.includes(stats.client_ip)) {
                                  ips.push(stats.client_ip);
                                  setGlobalAllowedIPs(ips.join(', '));
                                }
                              }}
                              className="text-[11px] text-zinc-900 hover:underline font-medium"
                            >
                              + 填入当前客户端 IP ({stats.client_ip})
                            </button>
                          )}
                        </div>
                        <input
                          type="text"
                          placeholder="例如: 123.45.67.89, 192.168.1.0/24"
                          value={globalAllowedIPs}
                          onChange={e => setGlobalAllowedIPs(e.target.value)}
                          className="flex h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-xs font-mono shadow-2xs transition-colors placeholder:text-zinc-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950"
                        />
                        <p className="text-[11px] text-zinc-500 mt-1.5">
                          设为白名单模式的文件将直接继承此全局允许列表（支持单个 IPv4/IPv6 或 CIDR 网段）。
                        </p>
                      </div>

                      <div className="pt-3 border-t border-zinc-100">
                        <label className="block text-xs font-medium text-zinc-800 mb-1">
                          全局恶意 IP 黑名单 (Global Blocked IPs)
                        </label>
                        <input
                          type="text"
                          placeholder="例如: 203.0.113.5, 198.51.100.0/24"
                          value={globalBlockedIPs}
                          onChange={e => setGlobalBlockedIPs(e.target.value)}
                          className="flex h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-xs font-mono shadow-2xs transition-colors placeholder:text-zinc-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950"
                        />
                        <p className="text-[11px] text-zinc-500 mt-1.5">
                          黑名单中的 IP 发起任何资源请求均直接被硬性阻断并返回 403。
                        </p>
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={saving}
                        className="inline-flex h-8 items-center justify-center rounded-md bg-zinc-900 px-4 text-xs font-medium text-zinc-50 shadow-xs hover:bg-zinc-900/90 transition-colors disabled:opacity-50"
                      >
                        {saving ? '保存中...' : '保存策略'}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* ================= Tab 4: API 凭证与 PicGo ================= */}
              {activeTab === 'api' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-base font-semibold text-zinc-900 leading-none">API 凭证与图床客户端</h3>
                    <p className="text-xs text-zinc-500 mt-1.5">用于配合 PicGo、Typora、Raycast 等工具一键上传文件。</p>
                  </div>

                  <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-2xs space-y-4">
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-medium text-zinc-800">当前 API Key</label>
                        <button
                          type="button"
                          onClick={handleRegenerateKey}
                          className="inline-flex items-center gap-1 text-[11px] text-zinc-600 hover:text-zinc-900 transition-colors"
                        >
                          <RefreshCw className="w-3 h-3" />
                          重新生成
                        </button>
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          readOnly
                          value={apiKey || '暂未生成固定 Key（当前支持通过登录 Token 访问）'}
                          className="flex h-9 w-full rounded-md border border-zinc-200 bg-zinc-50 px-3 text-xs font-mono text-zinc-800 focus:outline-none"
                        />
                        {apiKey && (
                          <button
                            type="button"
                            onClick={() => copyToClipboard(apiKey, 'API Key')}
                            className="inline-flex h-9 px-3 items-center justify-center rounded-md border border-zinc-200 bg-white text-xs font-medium text-zinc-700 hover:bg-zinc-100 transition-colors gap-1"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            拷贝
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="pt-3 border-t border-zinc-100">
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-medium text-zinc-800">PicGo 图床自定义配置参考</label>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(picGoConfigJson, 'PicGo 配置')}
                          className="text-[11px] text-zinc-900 hover:underline font-medium"
                        >
                          拷贝配置 JSON
                        </button>
                      </div>
                      <pre className="p-3 bg-zinc-50 rounded-md border border-zinc-200 text-[11px] font-mono text-zinc-700 overflow-x-auto leading-relaxed">
                        {picGoConfigJson}
                      </pre>
                    </div>
                  </div>
                </div>
              )}

              {/* ================= Tab 5: 存储状态 ================= */}
              {activeTab === 'storage' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-base font-semibold text-zinc-900 leading-none">存储概览与状态</h3>
                    <p className="text-xs text-zinc-500 mt-1.5">实时监控磁盘已用空间与资源分布情况。</p>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-2xs">
                      <div className="text-[11px] text-zinc-500 mb-1">总存储空间</div>
                      <div className="text-lg font-semibold font-mono text-zinc-900">
                        {stats ? formatSize(stats.total_size_bytes) : '--'}
                      </div>
                    </div>
                    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-2xs">
                      <div className="text-[11px] text-zinc-500 mb-1">总文件数</div>
                      <div className="text-lg font-semibold font-mono text-zinc-900">
                        {stats?.total_files ?? 0}
                      </div>
                    </div>
                    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-2xs">
                      <div className="text-[11px] text-zinc-500 mb-1">图片资源</div>
                      <div className="text-lg font-semibold font-mono text-zinc-900">
                        {stats?.total_images ?? 0}
                      </div>
                    </div>
                    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-2xs">
                      <div className="text-[11px] text-zinc-500 mb-1">文件夹数</div>
                      <div className="text-lg font-semibold font-mono text-zinc-900">
                        {stats?.total_folders ?? 0}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-2xs space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-zinc-800">当前检测客户端真实 IP</span>
                      <span className="font-mono text-zinc-600 bg-zinc-100 px-2 py-0.5 rounded">
                        {stats?.client_ip || '127.0.0.1'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs pt-2 border-t border-zinc-100">
                      <span className="font-medium text-zinc-800">服务状态</span>
                      <span className="inline-flex items-center gap-1.5 text-emerald-600 font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" /> 正常运行中
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* ================= Tab 6: 账户密码 ================= */}
              {activeTab === 'account' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-base font-semibold text-zinc-900 leading-none">修改管理员密码</h3>
                    <p className="text-xs text-zinc-500 mt-1.5">修改后直接持久化保存至数据库，无需重启服务。</p>
                  </div>

                  <form onSubmit={handleChangePassword} className="space-y-4">
                    <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-2xs space-y-3.5">
                      <div>
                        <label className="block text-xs font-medium text-zinc-800 mb-1">当前旧密码</label>
                        <input
                          type="password"
                          required
                          value={oldPassword}
                          onChange={e => setOldPassword(e.target.value)}
                          className="flex h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-xs shadow-2xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-zinc-800 mb-1">新密码</label>
                        <input
                          type="password"
                          required
                          value={newPassword}
                          onChange={e => setNewPassword(e.target.value)}
                          placeholder="不少于 6 位"
                          className="flex h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-xs shadow-2xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-zinc-800 mb-1">确认新密码</label>
                        <input
                          type="password"
                          required
                          value={confirmPassword}
                          onChange={e => setConfirmPassword(e.target.value)}
                          className="flex h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-xs shadow-2xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={changingPass}
                        className="inline-flex h-8 items-center justify-center rounded-md bg-zinc-900 px-4 text-xs font-medium text-zinc-50 shadow-xs hover:bg-zinc-900/90 transition-colors disabled:opacity-50"
                      >
                        {changingPass ? '更新中...' : '确认更新密码'}
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
