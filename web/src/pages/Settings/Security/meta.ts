import { lazy } from 'react';
import { Shield } from 'lucide-react';
import type { RouteMeta } from '../../../types/route';

const meta: RouteMeta = {
  title: '安全与 IP 策略',
  path: '/settings/security',
  order: 3,
  icon: Shield,
  layout: 'settings',
  component: lazy(() => import('./index')),
};

export default meta;
