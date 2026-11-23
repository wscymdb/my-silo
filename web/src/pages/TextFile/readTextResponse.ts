export interface TextFileData {
  id: string;
  name: string;
  content: string;
  format: 'markdown' | 'text';
  version: string;
  size_bytes: number;
}

export async function readTextResponse(response: Response): Promise<TextFileData> {
  let data;
  try {
    data = JSON.parse(await response.text());
  } catch {
    if (response.status === 404) {
      throw new Error('后端尚未提供文本接口（404）。请停止旧 Go 服务，在项目根目录重新运行 bash start.sh。');
    }
    throw new Error(`文本接口返回异常（HTTP ${response.status}），请检查 Go 服务和代理配置。`);
  }
  if (!response.ok) {
    throw new Error(typeof data?.error === 'string' ? data.error : `文件请求失败（HTTP ${response.status}）`);
  }
  if (!data || typeof data.id !== 'string' || typeof data.name !== 'string'
    || typeof data.content !== 'string' || typeof data.version !== 'string'
    || !['markdown', 'text'].includes(data.format) || typeof data.size_bytes !== 'number') {
    throw new Error('文本接口响应格式不正确，请确认前后端已更新到同一版本。');
  }
  return data;
}
