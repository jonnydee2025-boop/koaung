import {
  AlertTriangle,
  Server,
  Sparkles,
  Table2,
} from 'lucide-react';

/** Settings areas promoted to main sidebar navigation. */
export const SETTINGS_SECTIONS = [
  {
    id: 'general',
    label: 'General',
    icon: Server,
    path: '/general',
    title: 'General',
    subtitle: 'Server configuration & session',
  },
  {
    id: 'ai',
    label: 'AI',
    icon: Sparkles,
    path: '/ai',
    title: 'AI',
    subtitle: 'Gemini models & API keys',
  },
  {
    id: 'rules',
    label: 'Row rules',
    icon: Table2,
    path: '/row-rules',
    title: 'Row rules',
    subtitle: 'Background, thumbnail & batch rows',
  },
  {
    id: 'danger',
    label: 'Danger',
    icon: AlertTriangle,
    path: '/danger',
    title: 'Danger',
    subtitle: 'Shutdown & destructive actions',
  },
];

export function settingsSectionForPath(pathname) {
  return SETTINGS_SECTIONS.find((section) => section.path === pathname)?.id ?? null;
}

export function settingsSectionMeta(sectionId) {
  return SETTINGS_SECTIONS.find((section) => section.id === sectionId) ?? SETTINGS_SECTIONS[0];
}
