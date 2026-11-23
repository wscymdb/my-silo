import { lazy } from 'react';
import type { RouteMeta } from '../../types/route';

const meta: RouteMeta = {
  title: '文件库',
  path: '/',
  layout: 'home',
  hideInMenu: true,
  component: lazy(() => import('./index')),
};

export default meta;
