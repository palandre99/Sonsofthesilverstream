/** The app's information architecture — CEO-final (2026-08-15):
 *
 *   SIDE PANEL  = main domains (Breeding · Map · Tools & Items · Bosses ·
 *                 Settings), swipeable, two snap widths.
 *   BOTTOM BAR  = the current domain's own tabs — and the Paldex sits in
 *                 the CENTER slot of every domain. It is the app's anchor.
 *   EXCEPTION   = the Map domain is FULLSCREEN (CEO 2026-08-15): no bottom
 *                 tabs — layer filters live inside the map itself, like any
 *                 great map app. `tabs: []` encodes that.
 *   EXCEPTION   = the Items domain anchors its center on the full item
 *                 index, not the Paldex (CEO 2026-08-18: "u have full
 *                 freedom over" the tabs; "i think maybe paldex doesnt
 *                 belong here") — every item thing lives one tap deep.
 *
 * Icons are MaterialCommunityIcons names (rendered via ui/Icon).
 * Domains/tabs we aren't building yet ship as designed coming-soon screens
 * so the whole app's shape is real from day one.
 */

export interface TabDef {
  id: string;
  label: string;
  icon: string;
  soon?: boolean;
  blurb?: string;
  planned?: string[];
}

export interface DomainDef {
  id: string;
  title: string;
  /** fits the panel's compact width; falls back to title */
  short?: string;
  icon: string;
  soon?: boolean;
  blurb?: string;
  planned?: string[];
  /** 5 tabs with the domain's anchor at index 2 (the Paldex everywhere,
   *  the item index in the Items domain) — or [] for a fullscreen domain */
  tabs: TabDef[];
}

const PALDEX: TabDef = { id: 'paldex', label: 'Paldex', icon: 'book-open-variant' };

export const DOMAINS: DomainDef[] = [
  {
    id: 'breeding',
    title: 'Breeding',
    icon: 'egg-outline',
    tabs: [
      { id: 'calc', label: 'Calc', icon: 'calculator-variant-outline' },
      { id: 'plan', label: 'Plan', icon: 'source-branch' },
      PALDEX,
      { id: 'odds', label: 'Odds', icon: 'dice-multiple-outline' },
      { id: 'ref', label: 'Ref', icon: 'information-outline' },
    ],
  },
  {
    id: 'map',
    title: 'Map',
    icon: 'map-outline',
    blurb: 'The whole world on one fullscreen map — every layer of the game, '
      + 'toggled by filters inside the map itself. No tabs down here; the map '
      + 'IS the screen.',
    tabs: [],
  },
  {
    id: 'items',
    title: 'Tools & Items',
    short: 'Items',
    icon: 'sword-cross',
    blurb: 'Every weapon, armor, tool, sphere, consumable and schematic — '
      + 'ranked worst to best, with stats and where to get them.',
    // CEO 2026-08-18 ("u have full freedom over" the tabs; "i think maybe
    // paldex doesnt belong here"): this domain is the ONE exception to the
    // Paldex-center rule — its center anchor is the full item index
    // itself. Every tab hosts the same index opened on its group; the
    // group chips reach everything else (schematics, materials, gear...).
    tabs: [
      { id: 'weapons', label: 'Weapons', icon: 'bow-arrow' },
      { id: 'armor', label: 'Armor', icon: 'shield-half-full' },
      { id: 'allitems', label: 'Items', icon: 'view-grid-outline' },
      { id: 'food', label: 'Food', icon: 'food-drumstick-outline' },
      { id: 'spheres', label: 'Spheres', icon: 'record-circle-outline' },
    ],
  },
  {
    id: 'bosses',
    title: 'Bosses & Raids',
    short: 'Bosses',
    icon: 'crown-outline',
    blurb: 'Tower bosses, alphas and raids — with teams built from YOUR pals.',
    tabs: [
      // LIVE 2026-08-18 (Bosses fane phase A): the tower campaign with the
      // Boss Card — real fight rows, counters from the player's own box
      { id: 'tower', label: 'Tower', icon: 'chess-rook' },
      // LIVE 2026-08-19 (Bosses fane phase B): every titled boss with
      // beaten/caught tracking per profile
      { id: 'alphas', label: 'Alphas', icon: 'alert-octagram-outline' },
      PALDEX,
      {
        id: 'raids', label: 'Raids', icon: 'lightning-bolt-outline', soon: true,
        blurb: 'Raid bosses and preparation checklists.',
        planned: ['Raid guides', 'Reward tables'],
      },
      {
        id: 'teams', label: 'Teams', icon: 'account-group-outline', soon: true,
        blurb: 'Build combat teams from the pals you own.',
        planned: ['Team builder', 'Element coverage analysis'],
      },
    ],
  },
  {
    id: 'settings',
    title: 'Settings',
    icon: 'cog-outline',
    tabs: [
      { id: 'profiles', label: 'Profiles', icon: 'content-save-outline' },
      {
        id: 'worlds', label: 'Worlds', icon: 'earth', soon: true,
        blurb: 'Attach your world saves — progress, bosses beaten, tech level, all tracked automatically.',
        planned: ['Save-file import (read-only)', 'Auto-filled collection', 'World progress tracking'],
      },
      PALDEX,
      {
        id: 'appearance', label: 'Look', icon: 'palette-outline', soon: true,
        blurb: 'Themes, accent colors, icon packs.',
        planned: ['Light theme', 'Accent choices'],
      },
      { id: 'about', label: 'About', icon: 'information-outline' },
    ],
  },
];
