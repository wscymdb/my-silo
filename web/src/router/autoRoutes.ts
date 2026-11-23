import type { MenuItem, RouteMeta } from '../types/route';

// Page metadata is eager; page components declared with lazy() load on navigation.
const metaModules = import.meta.glob<{ default: RouteMeta }>('/src/pages/**/meta.ts', { eager: true });
export const allRoutes: RouteMeta[] = Object.values(metaModules).map(module => module.default);
const paths = new Set<string>();
for (const route of allRoutes) {
  if (!route.path.startsWith('/') || paths.has(route.path)) {
    throw new Error(`Invalid or duplicate page route: ${route.path}`);
  }
  paths.add(route.path);
}
export const settingsMenuItems: MenuItem[] = allRoutes
  .filter(route => route.layout === 'settings' && !route.hideInMenu)
  .sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || a.path.localeCompare(b.path))
  .map(({ title, path, order, icon }) => ({ title, path, order: order ?? 99, icon }));
