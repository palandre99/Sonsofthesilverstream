/** Game-dump stat + food + element icons (via palcalc resources). */
/* eslint-disable @typescript-eslint/no-require-imports */
export const STAT_ICONS = {
  food_on: require('../../assets/stat/FoodOn.png'),
  food_off: require('../../assets/stat/FoodOff.png'),
  health: require('../../assets/stat/Health.png'),
  attack: require('../../assets/stat/Attack.png'),
  defense: require('../../assets/stat/Defense.png'),
} as const;

/** Our element names -> the game's icon files. */
export const ELEMENT_ICONS: Record<string, number> = {
  Neutral: require('../../assets/elements/Normal.png'),
  Fire: require('../../assets/elements/Fire.png'),
  Water: require('../../assets/elements/Water.png'),
  Grass: require('../../assets/elements/Leaf.png'),
  Electric: require('../../assets/elements/Electricity.png'),
  Ice: require('../../assets/elements/Ice.png'),
  Ground: require('../../assets/elements/Earth.png'),
  Dark: require('../../assets/elements/Dark.png'),
  Dragon: require('../../assets/elements/Dragon.png'),
};
