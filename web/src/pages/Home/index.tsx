import React, { useState, useEffect, useRef } from 'react';
import {
  Folder,
  File,
  ChevronRight,
  Upload,
  FolderPlus,
  LayoutGrid,
  List as ListIcon,
  Copy,
  Download,
  Trash2,
  ShieldCheck,
  Search,
  Lock,
  LogOut,
  SlidersHorizontal,
  Settings as SettingsIcon,
  ExternalLink,
  Pencil,
  X
} from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../../providers/AppProvider';
import ItemActions from './components/ItemActions';
import { writeClipboard } from '../../lib/clipboard';

interface Breadcrumb {
  id: string;
  name: string;
}

interface Item {
  id: string;
  parent_id: string | null;
  name: string;
  is_dir: boolean;
  size_bytes: number;
  mime_type: string;
  stored_path: string;
  access_type: 'public' | 'ip_whitelist' | 'private';
  allowed_ips: string;
  created_at: string;
  updated_at: string;
}

export default function HomePage() {
  const { token, setToken, showToast } = useApp();
  const navigate = useNavigate();

  // 目录与导航状态
  const [searchParams, setSearchParams] = useSearchParams();
  const currentFolderId = searchParams.get('folder') || '';
  const currentFolderRef = useRef(currentFolderId);
  currentFolderRef.current = currentFolderId;
  const itemsAbort = useRef<AbortController>();
  const setCurrentFolderId = (folderId: string) => {
    const params = new URLSearchParams(searchParams);
    if (folderId) params.set('folder', folderId);
    else params.delete('folder');
    setSearchParams(params, { replace: true });
    setSelectedItemId(null);
    setSearchQuery('');
    setTooltip(null);
  };
  const textFileUrl = (id: string) => `/files/${id}${currentFolderId ? `?${new URLSearchParams({ folder: currentFolderId })}` : ''}`;
  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<Item | null>(null);

  // 文件名修改与超长 Tooltip 状态
  const isTextFile = (item: Item) => !item.is_dir && /\.(md|txt)$/i.test(item.name);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renamingText, setRenamingText] = useState<string>('');
  const renamingItemRef = useRef<string | null>(null);
  const [tooltip, setTooltip] = useState<{
    text: string;
    x: number;
    y: number;
    placement: 'top' | 'bottom';
  } | null>(null);

  // 监听 ESC 键关闭大图查看器
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && previewImage) {
        setPreviewImage(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewImage]);

  // 弹窗状态
  const [newFolderOpen, setNewFolderOpen] = useState<boolean>(false);
  const [newFolderName, setNewFolderName] = useState<string>('');
  const [ipModalItem, setIpModalItem] = useState<Item | null>(null);
  const [ipAccessType, setIpAccessType] = useState<'public' | 'ip_whitelist' | 'private'>('public');
  const [ipAllowedStr, setIpAllowedStr] = useState<string>('');
  const [clientIP, setClientIP] = useState<string>('');

  // 拖拽上传状态
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [uploading, setUploading] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (token) {
      fetchItems(currentFolderId);
    }
    return () => itemsAbort.current?.abort();
  }, [token, currentFolderId]);

  const fetchItems = async (folderId: string) => {
    if (folderId !== currentFolderRef.current) return;
    itemsAbort.current?.abort();
    const controller = new AbortController();
    itemsAbort.current = controller;
    setLoading(true);
    try {
      const res = await fetch(`/api/items?parent_id=${encodeURIComponent(folderId)}`, {
        signal: controller.signal,
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.status === 401) {
        setToken('');
        return;
      }
      const data = await res.json();
      if (controller.signal.aborted) return;
      if (res.status === 404 && folderId) {
        setItems([]);
        setBreadcrumbs([]);
        setCurrentFolderId('');
        showToast('目录不存在或已删除，已返回全部文件');
        return;
      }
      if (!res.ok) throw new Error(data.error || '获取文件列表失败');
      setItems(data.items || []);
      setBreadcrumbs(data.breadcrumbs || []);
    } catch {
      if (!controller.signal.aborted) showToast('获取文件列表失败');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  };

  const handleLogout = () => {
    setToken('');
  };

  const uploadFiles = async (files: FileList | File[]) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append('files', files[i]);
    }
    formData.append('parent_id', currentFolderId);
    formData.append('access_type', 'public');

    try {
      const res = await fetch('/api/items/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });
      if (res.ok) {
        showToast('已上传');
        fetchItems(currentFolderId);
      } else {
        const err = await res.json();
        showToast(err.error || '上传失败');
      }
    } catch {
      showToast('上传出错');
    } finally {
      setUploading(false);
    }
  };

  // 监听剪贴板粘贴直接上传
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (!token) return;
      const clipboardItems = e.clipboardData?.items;
      if (!clipboardItems) return;
      const files: File[] = [];
      for (let i = 0; i < clipboardItems.length; i++) {
        if (clipboardItems[i].kind === 'file') {
          const file = clipboardItems[i].getAsFile();
          if (file) files.push(file);
        }
      }
      if (files.length > 0) {
        e.preventDefault();
        uploadFiles(files);
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [token, currentFolderId]);

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    try {
      const res = await fetch('/api/items/folder', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          parent_id: currentFolderId,
          name: newFolderName.trim()
        })
      });
      if (res.ok) {
        setNewFolderName('');
        setNewFolderOpen(false);
        fetchItems(currentFolderId);
        showToast('文件夹已创建');
      } else {
        const err = await res.json();
        showToast(err.error || '创建失败');
      }
    } catch {
      showToast('创建出错');
    }
  };

  const handleDelete = async (item: Item, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!confirm(`确定删除 "${item.name}" 吗？`)) return;
    try {
      const res = await fetch(`/api/items/${item.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        showToast('已删除');
        if (selectedItemId === item.id) setSelectedItemId(null);
        fetchItems(currentFolderId);
      }
    } catch {
      showToast('删除请求异常');
    }
  };

  const openIpModal = async (item: Item, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setIpModalItem(item);
    setIpAccessType(item.access_type);
    setIpAllowedStr(item.allowed_ips || '');
    try {
      const res = await fetch('/api/ip/current');
      const data = await res.json();
      if (data.ip) setClientIP(data.ip);
    } catch {}
  };

  const saveIpSettings = async () => {
    if (!ipModalItem) return;
    try {
      const res = await fetch(`/api/items/${ipModalItem.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          access_type: ipAccessType,
          allowed_ips: ipAllowedStr
        })
      });
      if (res.ok) {
        showToast('权限策略已保存');
        setIpModalItem(null);
        fetchItems(currentFolderId);
      }
    } catch {
      showToast('保存策略出错');
    }
  };

  const handleStartRename = (item: Item, e: React.MouseEvent) => {
    e.stopPropagation();
    setTooltip(null);
    renamingItemRef.current = item.id;
    setRenamingId(item.id);
    setRenamingText(item.name);
  };

  const handleSaveRename = async (id: string) => {
    if (renamingItemRef.current !== id) return;
    renamingItemRef.current = null;
    const trimmed = renamingText.trim();
    setRenamingId(null);
    if (!trimmed) return;
    const currentItem = items.find(i => i.id === id);
    if (currentItem && currentItem.name === trimmed) {
      return;
    }
    try {
      const res = await fetch(`/api/items/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ name: trimmed })
      });
      if (res.ok) {
        showToast('已重命名');
        fetchItems(currentFolderId);
      } else {
        const err = await res.json();
        showToast(err.error || '重命名失败');
      }
    } catch {
      showToast('重命名请求异常');
    }
  };

  const showTooltip = (target: HTMLElement, text: string) => {
    const rect = target.getBoundingClientRect();
    const isNearTop = rect.top < 45;
    setTooltip({
      text,
      x: rect.left + Math.min(rect.width / 2, 140),
      y: isNearTop ? rect.bottom + 8 : rect.top - 6,
      placement: isNearTop ? 'bottom' : 'top',
    });
  };

  const handleMouseEnterFileName = (e: React.MouseEvent, text: string) => {
    const target = e.currentTarget as HTMLElement;
    if (target.scrollWidth > target.clientWidth || text.length > 20) showTooltip(target, text);
  };

  const handleMouseLeaveFileName = () => {
    setTooltip(null);
  };

  const copyLink = async (id: string, name: string, type: 'url' | 'markdown' | 'download', e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const origin = window.location.origin;
    let text = `${origin}/f/${id}`;
    if (type === 'markdown') {
      text = `![${name}](${origin}/f/${id})`;
    } else if (type === 'download') {
      text = `${origin}/d/${id}`;
    }
    setTooltip(null);
    try {
      await writeClipboard(text);
      showToast(type === 'markdown' ? 'Markdown 链接已复制' : '直链已复制');
    } catch {
      showToast('复制失败，请手动复制链接');
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '--';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const filteredItems = items.filter(it =>
    it.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // ==================== shadcn/ui 风格：纯正亮色全屏 ====================
  return (
    <div
      className="min-h-screen w-full bg-white flex flex-col font-sans text-zinc-950 selection:bg-zinc-900 selection:text-white"
      onDragOver={e => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={e => {
        if (!e.relatedTarget) setIsDragging(false);
      }}
      onDrop={e => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files) uploadFiles(e.dataTransfer.files);
      }}
    >
      {/* 拖拽全屏遮罩 */}
      {isDragging && (
        <div className="fixed inset-0 z-50 bg-zinc-950/5 backdrop-blur-[2px] border-2 border-dashed border-zinc-950 m-4 rounded-lg flex flex-col items-center justify-center pointer-events-none">
          <Upload className="w-10 h-10 text-zinc-900 animate-pulse mb-2" />
          <p className="text-sm font-medium text-zinc-900">释放以添加到当前目录</p>
        </div>
      )}

      {/* 隐藏的上传 input */}
      <input
        type="file"
        multiple
        ref={fileInputRef}
        className="hidden"
        onChange={e => {
          if (e.target.files) uploadFiles(e.target.files);
        }}
      />

      {/* 顶部通栏 Navbar (shadcn 规范高度 56px) */}
      <header className="h-14 border-b border-zinc-200/80 px-6 flex items-center justify-between gap-4 bg-white sticky top-0 z-20">
        {/* 左侧：面包屑路径导航 */}
        <div className="flex items-center gap-1.5 min-w-0">
          {/* shadcn 风格 Breadcrumb 面包屑 */}
          <nav className="flex items-center text-xs font-medium text-zinc-500 overflow-hidden">
            <button
              onClick={() => setCurrentFolderId('')}
              className={`hover:text-zinc-900 transition-colors shrink-0 ${
                currentFolderId === '' ? 'text-zinc-900 font-semibold' : ''
              }`}
            >
              全部文件
            </button>
            {breadcrumbs.map((bc, idx) => (
              <React.Fragment key={bc.id}>
                <ChevronRight className="w-3.5 h-3.5 text-zinc-400 mx-1 shrink-0" />
                <button
                  onClick={() => setCurrentFolderId(bc.id)}
                  className={`hover:text-zinc-900 transition-colors truncate ${
                    idx === breadcrumbs.length - 1 ? 'text-zinc-900 font-semibold' : ''
                  }`}
                >
                  {bc.name}
                </button>
              </React.Fragment>
            ))}
          </nav>
        </div>

        {/* 右侧：shadcn 规范按钮与控件 */}
        <div className="flex items-center gap-2 shrink-0">
          {/* shadcn 风格搜索 Input */}
          <div className="relative hidden sm:block">
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="搜索项目..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="flex h-8 w-44 focus:w-60 rounded-md border border-zinc-200 bg-white pl-8 pr-3 text-xs shadow-2xs transition-all placeholder:text-zinc-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950"
            />
          </div>

          {/* 新建文件夹 (Outline 按钮) */}
          <button
            onClick={() => setNewFolderOpen(true)}
            className="inline-flex h-8 items-center justify-center rounded-md border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 shadow-2xs hover:bg-zinc-100 hover:text-zinc-900 transition-colors gap-1.5"
          >
            <FolderPlus className="w-3.5 h-3.5 text-zinc-500" />
            新建文件夹
          </button>

          {/* 上传文件 (Primary 黑底白字主按钮) */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="inline-flex h-8 items-center justify-center rounded-md bg-zinc-900 px-3.5 text-xs font-medium text-zinc-50 shadow-xs hover:bg-zinc-900/90 transition-colors gap-1.5 disabled:opacity-50"
          >
            <Upload className="w-3.5 h-3.5" />
            {uploading ? '上传中...' : '上传'}
          </button>

          <div className="h-4 w-px bg-zinc-200 mx-1" />

          {/* 视图切换 (shadcn Segmented Toggle) */}
          <div className="inline-flex h-8 items-center rounded-md border border-zinc-200 bg-zinc-50/50 p-0.5 text-zinc-500">
            <button
              onClick={() => setViewMode('list')}
              className={`inline-flex h-7 w-7 items-center justify-center rounded-[4px] transition-all ${
                viewMode === 'list'
                  ? 'bg-white text-zinc-950 shadow-2xs font-medium'
                  : 'hover:text-zinc-900'
              }`}
              title="列表视图"
            >
              <ListIcon className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`inline-flex h-7 w-7 items-center justify-center rounded-[4px] transition-all ${
                viewMode === 'grid'
                  ? 'bg-white text-zinc-950 shadow-2xs font-medium'
                  : 'hover:text-zinc-900'
              }`}
              title="网格视图"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* 设置导航 */}
          <button
            onClick={() => navigate('/settings')}
            title="系统公共配置"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 transition-colors"
          >
            <SettingsIcon className="w-3.5 h-3.5" />
          </button>

          {/* 退出登录 (Ghost 按钮) */}
          <button
            onClick={handleLogout}
            title="退出登录"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* 主工作区 */}
      <main className="flex-1 w-full p-6 overflow-y-auto" onClick={() => setSelectedItemId(null)}>
        {loading ? (
          <div className="h-64 flex items-center justify-center text-xs text-zinc-400">
            正在读取...
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="h-80 flex flex-col items-center justify-center text-center">
            <div className="w-12 h-12 rounded-full border border-dashed border-zinc-300 flex items-center justify-center mb-3 text-zinc-400">
              <Folder className="w-5 h-5 stroke-1" />
            </div>
            <h4 className="text-sm font-medium text-zinc-900">当前目录为空</h4>
            <p className="text-xs text-zinc-500 mt-1">拖拽文件到此处，或按 ⌘V 直接粘贴截图上传</p>
          </div>
        ) : viewMode === 'list' ? (
          /* ================= shadcn/ui Table 表格规范 ================= */
          <div className="w-full rounded-md border border-zinc-200 overflow-hidden bg-white shadow-2xs">
            <table className="w-full caption-bottom text-xs text-left">
              <thead className="[&_tr]:border-b border-zinc-200 bg-zinc-50/40">
                <tr className="border-b transition-colors">
                  <th className="h-10 px-4 text-left align-middle font-medium text-zinc-500">名称</th>
                  <th className="h-10 px-4 text-left align-middle font-medium text-zinc-500">访问权限</th>
                  <th className="h-10 px-4 text-left align-middle font-medium text-zinc-500">大小</th>
                  <th className="h-10 px-4 text-left align-middle font-medium text-zinc-500">修改时间</th>
                  <th className="h-10 px-4 text-right align-middle font-medium text-zinc-500">操作</th>
                </tr>
              </thead>
              <tbody className="[&_tr:last-child]:border-0 divide-y divide-zinc-100">
                {filteredItems.map(item => {
                  const isSelected = selectedItemId === item.id;
                  return (
                    <tr
                      key={item.id}
                      onClick={e => {
                        e.stopPropagation();
                        setSelectedItemId(item.is_dir ? null : item.id);
                      }}
                      onDoubleClick={() => {
                        if (item.is_dir) setCurrentFolderId(item.id);
                      }}
                      className={`group cursor-pointer transition-colors ${item.is_dir ? 'select-none' : ''} ${
                        isSelected
                          ? 'bg-zinc-100/80'
                          : 'hover:bg-zinc-50/70'
                      }`}
                    >
                      <td className="p-2.5 px-4 align-middle font-medium text-zinc-900 flex items-center gap-2.5">
                        {item.is_dir ? (
                          <Folder className="w-4 h-4 text-zinc-600 fill-zinc-600/10 shrink-0" />
                        ) : item.mime_type.startsWith('image/') ? (
                          <div
                            onClick={e => {
                              e.stopPropagation();
                              setPreviewImage(item);
                            }}
                            className="w-7 h-7 rounded border border-zinc-200 overflow-hidden shrink-0 bg-zinc-50 cursor-zoom-in hover:border-zinc-400 transition-colors"
                            title="点击查看大图"
                          >
                            <img
                              src={`/f/${item.id}`}
                              alt={item.name}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          </div>
                        ) : (
                          <File className="w-4 h-4 text-zinc-400 shrink-0" />
                        )}
                        {renamingId === item.id ? (
                          <input
                            type="text"
                            value={renamingText}
                            autoFocus
                            onClick={e => e.stopPropagation()}
                            onDoubleClick={e => e.stopPropagation()}
                            onChange={e => setRenamingText(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                handleSaveRename(item.id);
                              } else if (e.key === 'Escape') {
                                renamingItemRef.current = null;
                                setRenamingId(null);
                              }
                            }}
                            onBlur={() => handleSaveRename(item.id)}
                            className="h-7 w-64 rounded-md border border-zinc-950 bg-white px-2 text-xs font-medium text-zinc-900 shadow-2xs focus:outline-none focus:ring-1 focus:ring-zinc-950"
                          />
                        ) : (
                          <>
                            {isTextFile(item) ? (
                              <Link to={textFileUrl(item.id)} onClick={e => e.stopPropagation()}
                                className="truncate max-w-[240px] sm:max-w-md text-zinc-900 hover:underline underline-offset-2"
                                onMouseEnter={e => handleMouseEnterFileName(e, item.name)} onMouseLeave={handleMouseLeaveFileName}>
                                {item.name}
                              </Link>
                            ) : (
                              <span className={`truncate max-w-[240px] sm:max-w-md cursor-pointer ${item.is_dir ? 'select-none' : 'select-text'}`}
                                onMouseEnter={e => handleMouseEnterFileName(e, item.name)} onMouseLeave={handleMouseLeaveFileName}>
                                {item.name}
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={e => handleStartRename(item, e)}
                              onDoubleClick={e => e.stopPropagation()}
                              title="重命名"
                              aria-label={`重命名 ${item.name}`}
                              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-zinc-400 transition-opacity hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-900 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 [@media(hover:none)]:opacity-100"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </td>
                      <td className="p-3 px-4 align-middle">
                        {item.access_type === 'public' && (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[11px] font-medium text-zinc-700">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            公开
                          </span>
                        )}
                        {item.access_type === 'ip_whitelist' && (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[11px] font-medium text-zinc-700">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                            IP 受限
                          </span>
                        )}
                        {item.access_type === 'private' && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[11px] text-zinc-500">
                            <Lock className="w-3 h-3 text-zinc-400" />
                            私有
                          </span>
                        )}
                      </td>
                      <td className="p-3 px-4 align-middle text-zinc-500 font-mono text-[11px]">
                        {item.is_dir ? '--' : formatSize(item.size_bytes)}
                      </td>
                      <td className="p-3 px-4 align-middle text-zinc-500 text-[11px]">
                        {new Date(item.updated_at || item.created_at).toLocaleString('zh-CN', {
                          year: 'numeric', month: '2-digit', day: '2-digit',
                          hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
                        })}
                      </td>
                      <td className="p-3 px-4 align-middle text-right">
                        <div className="flex items-center justify-end gap-1">
                          {!item.is_dir && (
                            <button type="button" aria-label={`复制直链 ${item.name}`}
                              onClick={e => void copyLink(item.id, item.name, 'url', e)}
                              onDoubleClick={e => e.stopPropagation()}
                              onMouseEnter={e => showTooltip(e.currentTarget, '复制直链')}
                              onFocus={e => showTooltip(e.currentTarget, '复制直链')}
                              onMouseLeave={handleMouseLeaveFileName} onBlur={handleMouseLeaveFileName}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-900">
                              <Copy className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <ItemActions name={item.name} actions={[
                            ...(!item.is_dir ? [
                              { label: '下载', icon: Download, href: `/d/${item.id}`, download: true },
                            ] : []),
                            { label: '配置 IP 权限', icon: SlidersHorizontal, onSelect: () => openIpModal(item) },
                            { label: '删除', icon: Trash2, destructive: true, onSelect: () => handleDelete(item) },
                          ]} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          /* ================= shadcn/ui Card 网格视图 ================= */
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3.5">
            {filteredItems.map(item => {
              const isSelected = selectedItemId === item.id;
              return (
                <div
                  key={item.id}
                  onClick={e => {
                    e.stopPropagation();
                    setSelectedItemId(item.is_dir ? null : item.id);
                  }}
                  onDoubleClick={() => {
                    if (item.is_dir) setCurrentFolderId(item.id);
                  }}
                  className={`group relative flex flex-col items-center p-3.5 rounded-lg border transition-all cursor-pointer select-none bg-white ${
                    isSelected
                      ? 'border-zinc-900 ring-1 ring-zinc-900 shadow-2xs'
                      : 'border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50/50 shadow-2xs'
                  }`}
                >
                  {!item.is_dir && (
                    <button type="button" aria-label={`复制直链 ${item.name}`}
                      onClick={e => void copyLink(item.id, item.name, 'url', e)}
                      onDoubleClick={e => e.stopPropagation()}
                      onMouseEnter={e => showTooltip(e.currentTarget, '复制直链')}
                      onFocus={e => showTooltip(e.currentTarget, '复制直链')}
                      onMouseLeave={handleMouseLeaveFileName} onBlur={handleMouseLeaveFileName}
                      className="absolute right-1.5 top-1.5 inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-900">
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <div
                    className="h-16 flex items-center justify-center mb-2"
                    onClick={e => {
                      if (item.mime_type.startsWith('image/')) {
                        e.stopPropagation();
                        setPreviewImage(item);
                      }
                    }}
                  >
                    {item.is_dir ? (
                      <Folder className="w-10 h-10 text-zinc-700 fill-zinc-700/10" />
                    ) : item.mime_type.startsWith('image/') ? (
                      <img
                        src={`/f/${item.id}`}
                        alt={item.name}
                        className="w-14 h-14 object-cover rounded-md border border-zinc-200 shadow-2xs cursor-zoom-in hover:scale-105 transition-transform"
                        loading="lazy"
                        title="点击查看大图"
                      />
                    ) : (
                      <File className="w-8 h-8 text-zinc-400" />
                    )}
                  </div>
                  <div className="w-full text-center">
                    {renamingId === item.id ? (
                      <input
                        type="text"
                        value={renamingText}
                        autoFocus
                        onClick={e => e.stopPropagation()}
                        onDoubleClick={e => e.stopPropagation()}
                        onChange={e => setRenamingText(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            handleSaveRename(item.id);
                          } else if (e.key === 'Escape') {
                            renamingItemRef.current = null;
                            setRenamingId(null);
                          }
                        }}
                        onBlur={() => handleSaveRename(item.id)}
                        className="h-6 w-full rounded border border-zinc-950 bg-white px-1.5 text-center text-xs font-medium text-zinc-900 shadow-2xs focus:outline-none focus:ring-1 focus:ring-zinc-950"
                      />
                    ) : (
                      <div className="flex min-w-0 items-center justify-center gap-1">
                        {isTextFile(item) ? (
                          <Link to={textFileUrl(item.id)} onClick={e => e.stopPropagation()}
                            className="min-w-0 truncate text-xs font-medium text-zinc-900 hover:underline underline-offset-2"
                            onMouseEnter={e => handleMouseEnterFileName(e, item.name)} onMouseLeave={handleMouseLeaveFileName}>
                            {item.name}
                          </Link>
                        ) : (
                          <span className={`text-xs font-medium text-zinc-900 truncate min-w-0 cursor-pointer ${item.is_dir ? 'select-none' : 'select-text'}`}
                            onMouseEnter={e => handleMouseEnterFileName(e, item.name)} onMouseLeave={handleMouseLeaveFileName}>
                            {item.name}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={e => handleStartRename(item, e)}
                          onDoubleClick={e => e.stopPropagation()}
                          title="重命名"
                          aria-label={`重命名 ${item.name}`}
                          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-zinc-400 transition-opacity hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-900 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 [@media(hover:none)]:opacity-100"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                    <span className="text-[10px] text-zinc-400 font-mono block mt-0.5">
                      {item.is_dir ? 'DIR' : formatSize(item.size_bytes)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* shadcn 规范 Modal 弹窗：新建文件夹 */}
      {newFolderOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white p-6 shadow-lg animate-in fade-in-0 zoom-in-95">
            <h3 className="text-base font-semibold leading-none tracking-tight text-zinc-900 mb-1.5">新建文件夹</h3>
            <p className="text-xs text-zinc-500 mb-4">输入需要创建的目录名称：</p>
            <form onSubmit={handleCreateFolder}>
              <input
                type="text"
                autoFocus
                placeholder="例如：博客配图、文档"
                value={newFolderName}
                onChange={e => setNewFolderName(e.target.value)}
                className="flex h-9 w-full rounded-md border border-zinc-200 bg-transparent px-3 py-1 text-xs shadow-2xs transition-colors placeholder:text-zinc-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950 mb-4"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setNewFolderOpen(false)}
                  className="inline-flex h-8 items-center justify-center rounded-md border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 shadow-2xs hover:bg-zinc-100 hover:text-zinc-900 transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="inline-flex h-8 items-center justify-center rounded-md bg-zinc-900 px-3.5 text-xs font-medium text-zinc-50 shadow-xs hover:bg-zinc-900/90 transition-colors"
                >
                  创建
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* shadcn 规范 Modal 弹窗：IP 与访问控制 */}
      {ipModalItem && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-6 shadow-lg animate-in fade-in-0 zoom-in-95">
            <div className="flex items-center gap-2 mb-1.5">
              <ShieldCheck className="w-4 h-4 text-zinc-900" />
              <h3 className="text-base font-semibold leading-none tracking-tight text-zinc-900">
                访问策略与 IP 限制
              </h3>
            </div>
            <p className="text-xs text-zinc-500 mb-4 truncate">
              当前目标: <span className="font-medium text-zinc-900">{ipModalItem.name}</span>
            </p>

            <div className="space-y-2 mb-4">
              <label
                className={`flex items-start gap-3 p-3 rounded-md border text-xs cursor-pointer transition-colors ${
                  ipAccessType === 'public'
                    ? 'border-zinc-900 bg-zinc-50/60 text-zinc-950'
                    : 'border-zinc-200 hover:bg-zinc-50/50 text-zinc-700'
                }`}
              >
                <input
                  type="radio"
                  name="access"
                  value="public"
                  checked={ipAccessType === 'public'}
                  onChange={() => setIpAccessType('public')}
                  className="mt-0.5 accent-zinc-900"
                />
                <div>
                  <div className="font-medium">公开访问 (Public)</div>
                  <div className="text-zinc-500 text-[11px] mt-0.5">任何人均可通过直链直接访问或下载。</div>
                </div>
              </label>

              <label
                className={`flex items-start gap-3 p-3 rounded-md border text-xs cursor-pointer transition-colors ${
                  ipAccessType === 'ip_whitelist'
                    ? 'border-zinc-900 bg-zinc-50/60 text-zinc-950'
                    : 'border-zinc-200 hover:bg-zinc-50/50 text-zinc-700'
                }`}
              >
                <input
                  type="radio"
                  name="access"
                  value="ip_whitelist"
                  checked={ipAccessType === 'ip_whitelist'}
                  onChange={() => setIpAccessType('ip_whitelist')}
                  className="mt-0.5 accent-zinc-900"
                />
                <div>
                  <div className="font-medium">IP 白名单限制 (IP Whitelist)</div>
                  <div className="text-zinc-500 text-[11px] mt-0.5">仅在列表中的指定 IP 或 CIDR 网段允许访问，其余直接阻断。</div>
                </div>
              </label>

              <label
                className={`flex items-start gap-3 p-3 rounded-md border text-xs cursor-pointer transition-colors ${
                  ipAccessType === 'private'
                    ? 'border-zinc-900 bg-zinc-50/60 text-zinc-950'
                    : 'border-zinc-200 hover:bg-zinc-50/50 text-zinc-700'
                }`}
              >
                <input
                  type="radio"
                  name="access"
                  value="private"
                  checked={ipAccessType === 'private'}
                  onChange={() => setIpAccessType('private')}
                  className="mt-0.5 accent-zinc-900"
                />
                <div>
                  <div className="font-medium">仅管理员私有 (Private)</div>
                  <div className="text-zinc-500 text-[11px] mt-0.5">外部完全不可见，必须携带登录凭证。</div>
                </div>
              </label>
            </div>

            {/* IP 输入框 */}
            {ipAccessType === 'ip_whitelist' && (
              <div className="mb-4 p-3 bg-zinc-50 rounded-md border border-zinc-200">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-medium text-zinc-700">允许的 IP 列表</span>
                  {clientIP && (
                    <button
                      type="button"
                      onClick={() => {
                        const ips = ipAllowedStr ? ipAllowedStr.split(',').map(s => s.trim()) : [];
                        if (!ips.includes(clientIP)) {
                          ips.push(clientIP);
                          setIpAllowedStr(ips.join(', '));
                        }
                      }}
                      className="text-[11px] text-zinc-900 hover:underline font-medium"
                    >
                      + 填入当前客户端 IP ({clientIP})
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  placeholder="例如: 123.45.67.89, 192.168.1.0/24"
                  value={ipAllowedStr}
                  onChange={e => setIpAllowedStr(e.target.value)}
                  className="flex h-8 w-full rounded-md border border-zinc-200 bg-white px-2.5 text-xs font-mono shadow-2xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950"
                />
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIpModalItem(null)}
                className="inline-flex h-8 items-center justify-center rounded-md border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 shadow-2xs hover:bg-zinc-100 hover:text-zinc-900 transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                onClick={saveIpSettings}
                className="inline-flex h-8 items-center justify-center rounded-md bg-zinc-900 px-3.5 text-xs font-medium text-zinc-50 shadow-xs hover:bg-zinc-900/90 transition-colors"
              >
                保存设置
              </button>
            </div>
          </div>
        </div>
      )}

      {/* shadcn 风格大图查看器 Lightbox Dialog */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex flex-col items-center justify-between p-4 sm:p-6 animate-in fade-in-0 select-none"
          onClick={() => setPreviewImage(null)}
        >
          {/* 顶栏控制条 */}
          <div
            className="w-full max-w-4xl flex items-center justify-between text-white text-xs px-2 py-1.5 bg-zinc-900/60 backdrop-blur-md rounded-lg border border-white/10"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-2.5 truncate">
              <span className="font-medium truncate max-w-xs sm:max-w-md">{previewImage.name}</span>
              <span className="text-zinc-400 font-mono text-[11px]">{formatSize(previewImage.size_bytes)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={e => copyLink(previewImage.id, previewImage.name, 'url', e)}
                className="inline-flex h-7 px-2 items-center justify-center rounded-md bg-white/10 hover:bg-white/20 text-white transition-colors gap-1 text-[11px]"
                title="复制直链"
              >
                <Copy className="w-3 h-3" />
                <span>复制链接</span>
              </button>
              <button
                onClick={e => copyLink(previewImage.id, previewImage.name, 'markdown', e)}
                className="inline-flex h-7 px-2 items-center justify-center rounded-md bg-white/10 hover:bg-white/20 text-white transition-colors text-[11px] font-mono font-bold"
                title="复制 Markdown 语法"
              >
                MD
              </button>
              <a
                href={`/f/${previewImage.id}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-7 px-2 items-center justify-center rounded-md bg-white/10 hover:bg-white/20 text-white transition-colors gap-1 text-[11px]"
                title="新标签页打开原图"
              >
                <ExternalLink className="w-3 h-3" />
              </a>
              <button
                onClick={() => setPreviewImage(null)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-white/10 hover:bg-white/20 text-white transition-colors ml-1"
                title="关闭 (Esc)"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* 居中大图展示 */}
          <div
            className="flex-1 flex items-center justify-center max-w-full max-h-[82vh] overflow-hidden my-auto"
            onClick={e => e.stopPropagation()}
          >
            <img
              src={`/f/${previewImage.id}`}
              alt={previewImage.name}
              className="max-w-full max-h-[82vh] object-contain rounded-md shadow-2xl transition-transform"
            />
          </div>

          <div className="text-[11px] text-zinc-400">
            按 ESC 或点击背景空白区域退出
          </div>
        </div>
      )}

      {/* shadcn 风格浮动 Tooltip */}
      {tooltip && (
        <div role="tooltip"
          className={`fixed z-50 pointer-events-none px-2.5 py-1 text-xs text-zinc-50 bg-zinc-900 rounded-md shadow-md border border-zinc-800 -translate-x-1/2 ${
            tooltip.placement === 'top' ? '-translate-y-full mb-1.5' : 'mt-1.5'
          } transition-opacity duration-150 animate-in fade-in-0 zoom-in-95 max-w-xs sm:max-w-md break-all text-center`}
          style={{ top: `${tooltip.y}px`, left: `${tooltip.x}px` }}
        >
          {tooltip.text}
        </div>
      )}


    </div>
  );
}
