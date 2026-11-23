# 前端页面与路由规范

- 使用 React Router 管理页面导航，禁止另用组件内的 tab 状态或手写 History 维护页面位置。
- 每个页面放在 `web/src/pages/<页面>/` 下，包含 `index.tsx` 与 `meta.ts`；页面内部组件放在同级 `components/` 中。
- `meta.ts` 默认导出符合 `RouteMeta` 的配置，集中声明标题、绝对路径、布局、菜单排序、图标与菜单可见性。页面组件通过 `React.lazy` 导入。
- `web/src/router/autoRoutes.ts` 使用 `import.meta.glob` 自动收集页面配置；菜单由同一批配置生成，禁止在侧栏重复维护页面列表。
- `web/src/router/index.tsx` 统一管理布局、登录守卫、默认跳转和未知路径。新增布局时同步扩展 `RouteMeta` 与布局注册。
- 公共布局位于 `web/src/layouts/`，通过 `Outlet` 渲染子页面；侧栏使用 `NavLink`，当前选中项由 URL 决定。
- `/settings` 默认跳转到 `/settings/general`。Settings 每个菜单项都是独立子路由，必须支持直接访问、刷新以及浏览器前进后退。
- 公共认证和消息提示由 `AppProvider` 管理，设置共享数据由 `SettingsProvider` 管理；不要让独立页面依赖 Home 页面传参或挂载。
- 未登录访问受保护页面时保留原路径、查询参数和 hash，登录成功后返回原地址。登录返回地址只接受站内路径。
- 路由位置与数据持久化分别处理：刷新后从 URL 恢复页面，已保存配置从 API 加载；路由不负责保存未提交表单。
