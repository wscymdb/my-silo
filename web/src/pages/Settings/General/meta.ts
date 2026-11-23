import { lazy } from 'react';
import { Globe } from 'lucide-react';
import type { RouteMeta } from '../../../types/route';

const meta: RouteMeta = {
  title: '常规与外链',
  path: '/settings/general',
  order: 1,
  icon: Globe,
  layout: 'settings',
  component: lazy(() => import('./index')),
};

export default meta;
