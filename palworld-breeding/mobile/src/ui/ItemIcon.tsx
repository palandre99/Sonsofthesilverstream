/** A square for every item's image — the CEO's order (2026-08-18):
 * "Everything needs a square for the image of the item."
 *
 * Icons ship as a few big sprite sheets + a generated coordinate map
 * (tools/fetch_item_icons.py) because EAS caps an update at 1000 assets
 * and the catalogue has 700+ unique textures. This component crops one
 * cell out of a sheet by coordinate. A missing icon gets the designed
 * placeholder — never a broken image, never an empty hole.
 */
import React from 'react';
import { Image, View } from 'react-native';
import { T } from '../theme';
import { Icon } from './Icon';
import {
  ICON_CELL, ICONS_PER_ROW, ITEM_ICON_COORDS, ITEM_ICON_SHEETS,
} from '../data/itemIcons.g';

export function ItemIcon({ icon, size = 40, tint }: {
  /** the backbone's icon texture name (ITEMS[id].icon) */
  icon: string | null | undefined;
  size?: number;
  /** tier colour — becomes a soft backdrop so rarity reads at a glance */
  tint?: string;
}) {
  const c = icon ? ITEM_ICON_COORDS[icon] : undefined;
  const box = {
    width: size,
    height: size,
    borderRadius: Math.round(size * 0.24),
    backgroundColor: tint ? tint + '14' : T.surface2,
    borderWidth: 1,
    borderColor: tint ? tint + '3C' : T.line,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    overflow: 'hidden' as const,
  };
  if (!c) {
    return (
      <View style={box}>
        <Icon name="cube-outline" size={size * 0.5} color={T.faint} />
      </View>
    );
  }
  const [sheet, col, row] = c;
  // the crop: a window one cell wide over the sheet scaled so each cell
  // renders at `inner` px — ICON_CELL only matters to the generator
  const inner = Math.round(size * 0.86);
  return (
    <View style={box}>
      <View style={{ width: inner, height: inner, overflow: 'hidden' }}>
        <Image
          source={ITEM_ICON_SHEETS[sheet]}
          style={{
            position: 'absolute',
            left: -col * inner,
            top: -row * inner,
            width: ICONS_PER_ROW * inner,
            height: ICONS_PER_ROW * inner,
          }}
          resizeMode="stretch"
          accessible={false}
          fadeDuration={0}
        />
      </View>
    </View>
  );
}

// keep the generator's cell constant referenced so a regenerated map that
// drops it fails the typecheck here instead of silently drifting
void ICON_CELL;
