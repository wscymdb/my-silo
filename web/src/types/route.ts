import type { ComponentType, LazyExoticComponent } from 'react';

export type RouteLayout = 'home' | 'settings' | 'none';
export interface RouteMeta {
  title: string;
  path: string;
  order?: number;
  icon?: ComponentType<{ className?: string }>;
  hideInMenu?: boolean;
  layout: RouteLayout;
  component: ComponentType | LazyExoticComponent<ComponentType>;
}
export interface MenuItem {
  title: string;
  path: string;
  order: number;
  icon?: RouteMeta['icon'];
}
