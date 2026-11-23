import { lazy } from 'react';
import type { RouteMeta } from '../../types/route';

const meta: RouteMeta = {
  title: '登录',
  path: '/login',
  layout: 'none',
  hideInMenu: true,
  component: lazy(() => import('./index')),
};

export default meta;
