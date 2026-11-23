import { lazy } from 'react';
import { Key } from 'lucide-react';
import type { RouteMeta } from '../../../types/route';

const meta: RouteMeta = {
  title: 'API 凭证 & 图床',
  path: '/settings/api',
  order: 4,
  icon: Key,
  layout: 'settings',
  component: lazy(() => import('./index')),
};

export default meta;
