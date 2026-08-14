/** The app's information architecture — CEO-final (2026-08-15):
 *
 *   SIDE PANEL  = main domains (Breeding · Map · Tools & Items · Bosses ·
 *                 Settings), swipeable, two snap widths.
 *   BOTTOM BAR  = the current domain's own tabs — and the Paldex sits in
 *                 the CENTER slot of every domain. It is the app's anchor.
 *
 * Domains/tabs we aren't building yet ship as designed coming-soon screens
 * so the whole app's shape is real from day one.
 */

export interface TabDef {
  id: string;
  label: string;
  glyph: string;
  soon?: boolean;
  blurb?: string;
  planned?: string[];
}

export interface DomainDef {
  id: string;
  title: string;
  glyph: string;
  soon?: boolean;
  blurb?: string;
  /** exactly 5 tabs; index 2 (center) is ALWAYS the Paldex */
  tabs: TabDef[];
}

const PALDEX: TabDef = { id: 'paldex', label: 'Paldex', glyph: '📖' };

export const DOMAINS: DomainDef[] = [
  {
    id: 'breeding',
    title: 'Breeding',
    glyph: '🥚',
    tabs: [
      { id: 'calc', label: 'Calc', glyph: '🧮' },
      { id: 'plan', label: 'Plan', glyph: '🥚' },
      PALDEX,
      { id: 'odds', label: 'Odds', glyph: '🎲' },
      { id: 'ref', label: 'Ref', glyph: 'ℹ️' },
    ],
  },
  {
    id: 'map',
    title: 'Map',
    glyph: '🗺️',
    soon: true,
    blurb: 'The full game map with filters for everything that matters.',
    tabs: [
      {
        id: 'world', label: 'World', glyph: '🗺️', soon: true,
        blurb: 'The entire game map — pan, zoom, and filter every layer.',
        planned: ['Filter by pal spawns', 'Waypoints & fast travel', 'Dungeons', 'Egg locations', 'Your missing pals highlighted'],
      },
      {
        id: 'spawns', label: 'Spawns', glyph: '🐾', soon: true,
        blurb: 'Spawn areas per species and element — tied to your collection.',
        planned: ['Per-species spawn layers', 'Day/night spawns', 'Alpha boss pins (91 already in the info cards)'],
      },
      PALDEX,
      {
        id: 'resources', label: 'Resources', glyph: '⛏️', soon: true,
        blurb: 'Ores, trees, berries — farming route material.',
        planned: ['Resource node layers', 'Best farming routes'],
      },
      {
        id: 'dungeons', label: 'Dungeons', glyph: '🕳️', soon: true,
        blurb: 'Dungeon entrances, respawn timers, loot.',
        planned: ['Entrance locations', 'Level ranges', 'Loot tables'],
      },
    ],
  },
  {
    id: 'items',
    title: 'Tools & Items',
    glyph: '⚔️',
    soon: true,
    blurb: 'Every weapon, armor, tool and schematic — worst to best, and where to get them.',
    tabs: [
      {
        id: 'weapons', label: 'Weapons', glyph: '🏹', soon: true,
        blurb: 'All weapons with stats, ranked worst to best.',
        planned: ['Damage/stats tables', 'Tech unlock levels', 'Where to find schematics'],
      },
      {
        id: 'armor', label: 'Armor', glyph: '🛡️', soon: true,
        blurb: 'Armor and accessories with real stats.',
        planned: ['Defense tables', 'Set comparisons', 'Crafting costs'],
      },
      PALDEX,
      {
        id: 'schematics', label: 'Schematics', glyph: '📜', soon: true,
        blurb: 'Every schematic tier and its source.',
        planned: ['Tier lists per item', 'Drop sources', 'Dungeon chest tables'],
      },
      {
        id: 'spheres', label: 'Spheres', glyph: '🔵', soon: true,
        blurb: 'Capture spheres and capture-rate math.',
        planned: ['Capture rate calculator', 'Sphere crafting chains'],
      },
    ],
  },
  {
    id: 'bosses',
    title: 'Bosses & Raids',
    glyph: '👑',
    soon: true,
    blurb: 'Tower bosses, alphas and raids — with teams from YOUR pals.',
    tabs: [
      {
        id: 'tower', label: 'Tower', glyph: '🗼', soon: true,
        blurb: 'Tower boss guides with element counters.',
        planned: ['Boss stats + counters', 'Team suggestions from your Paldex'],
      },
      {
        id: 'alphas', label: 'Alphas', glyph: '💢', soon: true,
        blurb: 'Every alpha boss — locations already live in the info cards.',
        planned: ['Alpha checklist tracking', 'Respawn timers'],
      },
      PALDEX,
      {
        id: 'raids', label: 'Raids', glyph: '⚡', soon: true,
        blurb: 'Raid bosses and preparation checklists.',
        planned: ['Raid guides', 'Reward tables'],
      },
      {
        id: 'teams', label: 'Teams', glyph: '🎯', soon: true,
        blurb: 'Build combat teams from the pals you own.',
        planned: ['Team builder', 'Element coverage analysis'],
      },
    ],
  },
  {
    id: 'settings',
    title: 'Settings',
    glyph: '⚙️',
    tabs: [
      { id: 'profiles', label: 'Profiles', glyph: '💾' },
      {
        id: 'worlds', label: 'Worlds', glyph: '🌍', soon: true,
        blurb: 'Attach your world saves — progress, bosses beaten, tech level, all tracked automatically.',
        planned: ['Save-file import (read-only)', 'Auto-filled collection', 'World progress tracking'],
      },
      PALDEX,
      {
        id: 'appearance', label: 'Look', glyph: '🎨', soon: true,
        blurb: 'Themes, accent colors, icon packs.',
        planned: ['Light theme', 'Accent choices'],
      },
      { id: 'about', label: 'About', glyph: '🔵' },
    ],
  },
];
