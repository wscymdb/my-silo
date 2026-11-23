import { useSettings } from '../../../providers/SettingsProvider';
import { CheckCircle2 } from 'lucide-react';

export default function StoragePage() {
  const { stats, formatSize } = useSettings();
  return (
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
  );
}
