import { MushroomTraits } from '../types';

/**
 * One-click example scenarios: fill a plausible, honest trait combination so
 * the user can see the engine's four risk levels without touching 22 selects.
 *
 * NOTE: these are *observation combinations for teaching*, not species
 * identifications. A scenario labelled "大青褶伞特征组合" shows the traits
 * you would record for that common look-alike — the engine still only grades
 * risk; it never "identifies" the species.
 */
export interface Scenario {
  id: string;
  label: string;
  description: string;
  traits: MushroomTraits;
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'chlorophyllum-molybdites',
    label: '大青褶伞特征组合',
    description: '绿色孢子印 → 高风险（草坪常见中毒种）',
    traits: {
      sporePrintColor: 'r',
      capColor: 'b',
      capSurface: 'y',
      gillColor: 'g',
      habitat: 'u',
      population: 'v',
    },
  },
  {
    id: 'chanterelle-like',
    label: '鸡油菌形态组合',
    description: '多项安全锚点 → 低风险（仍非食用建议）',
    traits: {
      capColor: 'y',
      capShape: 's',
      gillColor: 'o',
      gillSpacing: 'w',
      gillSize: 'b',
      odor: 'a',
      stalkRoot: 'c',
      habitat: 'd',
      population: 's',
    },
  },
  {
    id: 'amanita-muscaria-appearance',
    label: '毒蝇伞外观组合',
    description: '仅外观性状 → 无法判断（不确定性的价值）',
    traits: {
      capColor: 'e',
      capShape: 'x',
      capSurface: 'y',
      gillColor: 'w',
      ringNumber: 'o',
      ringType: 'p',
      habitat: 'd',
      population: 'y',
      odor: 'n',
    },
  },
  {
    id: 'mixed-signals',
    label: '混合信号组合',
    description: '正负信号并存 → 中风险',
    traits: {
      odor: 'n',
      gillSize: 'n',
      gillSpacing: 'w',
      stalkRoot: 'r',
      bruises: 'f',
      capShape: 'x',
      capColor: 'n',
    },
  },
  {
    id: 'sparse-input',
    label: '信息不足示例',
    description: '仅 2 项性状 → 强制无法判断（输入门槛）',
    traits: {
      capShape: 'x',
      capColor: 'n',
    },
  },
];
