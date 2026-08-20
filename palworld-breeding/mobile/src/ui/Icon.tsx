/** Vector icon wrapper (MaterialCommunityIcons). One cast point so the
 * rest of the app can carry icon names as plain strings in data. */
import React from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

type MCIName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export function Icon({ name, size = 20, color }: {
  name: string; size?: number; color?: string;
}) {
  return <MaterialCommunityIcons name={name as MCIName} size={size} color={color} />;
}
