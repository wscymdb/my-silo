import { lazy } from 'react';
import type { RouteMeta } from '../../types/route';

const meta: RouteMeta = {
  title: '文本文件',
  path: '/files/:id',
  layout: 'home',
  hideInMenu: true,
  component: lazy(() => import('./index')),
};

export default meta;
