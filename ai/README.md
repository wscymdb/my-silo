# AI 规则

在 `ai/rules/` 中维护 Markdown 规则文件，文件按名称排序生成。目前只读取该目录直属的 `.md` 文件。

生成脚本位于 `web/scripts/sync-ai-rules.mjs`，命令配置位于 `web/package.json`。在项目根目录执行：

```sh
npm --prefix web run ai:sync                 # 生成全部适配
npm --prefix web run ai:sync:antigravity     # 生成根目录 .agents/rules/*.md
npm --prefix web run ai:sync:codex           # 生成根目录 AGENTS.md
```

也可以进入 `web/` 后执行 `npm run ai:sync` 及对应的单目标命令。脚本按自身位置定位项目根目录，规则源和输出位置不随当前终端目录变化。

克隆项目后执行一次同步；修改规则源后重新执行。生成过程只使用 Node 内置模块，无需安装依赖。

规则源、生成脚本和 `web/package.json` 纳入 Git；`.agents/rules/` 和根目录 `AGENTS.md` 是本地产物，已加入 .gitignore。不要直接修改生成内容。

Codex 规则写入 AGENTS.md 的生成区块，区块外的手写说明会保留。Antigravity 保持每个源文件对应一个规则文件；删除源文件后，同步会清理带生成标记的对应旧文件，保留其他手写文件。
