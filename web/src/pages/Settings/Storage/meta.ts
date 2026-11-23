import { lazy } from 'react';
import { HardDrive } from 'lucide-react';
import type { RouteMeta } from '../../../types/route';

const meta: RouteMeta = {
  title: '存储状态',
  path: '/settings/storage',
  order: 5,
  icon: HardDrive,
  layout: 'settings',
  component: lazy(() => import('./index')),
};

export default meta;
