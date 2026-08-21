import { TraitDefinition } from './types';

/** Color palette for SVG mushroom rendering (UCI color codes). */
export const COLOR_MAP: Record<string, string> = {
  n: '#7B3F00', b: '#F5F5DC', c: '#D2691E', g: '#808080',
  r: '#228B22', p: '#FFB6C1', u: '#800080', e: '#B22222',
  w: '#FFFFFF', y: '#EAB308', k: '#000000', h: '#5D2906', o: '#FFA500',
};

/** 核心性状（观察门槛低、判别力强，6 项） */
export const CORE_TRAITS: TraitDefinition[] = [
  {
    id: 'odor',
    label: '气味',
    critical: true,
    hint: '最强判别性状（统计信息增益最高）',
    options: [
      { label: '杏仁味', value: 'a' }, { label: '茴香味', value: 'l' }, { label: '杂酚油味', value: 'c' },
      { label: '鱼腥味', value: 'y' }, { label: '恶臭', value: 'f' }, { label: '霉味', value: 'm' },
      { label: '无味', value: 'n' }, { label: '刺激性', value: 'p' }, { label: '辛辣', value: 's' },
    ],
  },
  {
    id: 'sporePrintColor',
    label: '孢子印颜色',
    critical: true,
    hint: '绿色孢子印 = 强风险信号',
    options: [
      { label: '黑色', value: 'k' }, { label: '棕色', value: 'n' }, { label: '浅黄色', value: 'b' },
      { label: '巧克力色', value: 'h' }, { label: '绿色', value: 'r' }, { label: '橙色', value: 'o' },
      { label: '紫色', value: 'u' }, { label: '白色', value: 'w' }, { label: '黄色', value: 'y' },
    ],
  },
  {
    id: 'gillSize',
    label: '菌褶大小',
    options: [{ label: '宽', value: 'b' }, { label: '窄', value: 'n' }],
  },
  {
    id: 'bruises',
    label: '受伤是否变色',
    options: [{ label: '是', value: 't' }, { label: '否', value: 'f' }],
  },
  {
    id: 'capShape',
    label: '菌盖形状',
    options: [
      { label: '钟形', value: 'b' }, { label: '锥形', value: 'c' }, { label: '凸面', value: 'x' },
      { label: '平展', value: 'f' }, { label: '中心凸起', value: 'k' }, { label: '中心凹陷', value: 's' },
    ],
  },
  {
    id: 'capColor',
    label: '菌盖颜色',
    options: [
      { label: '棕色', value: 'n' }, { label: '浅黄', value: 'b' }, { label: '肉桂色', value: 'c' },
      { label: '灰色', value: 'g' }, { label: '绿色', value: 'r' }, { label: '粉色', value: 'p' },
      { label: '紫色', value: 'u' }, { label: '红色', value: 'e' }, { label: '白色', value: 'w' }, { label: '黄色', value: 'y' },
    ],
  },
];

/** 辅助性状（16 项） */
export const ADVANCED_TRAITS: TraitDefinition[] = [
  {
    id: 'capSurface',
    label: '菌盖表面',
    options: [{ label: '纤维状', value: 'f' }, { label: '凹槽状', value: 'g' }, { label: '鳞片状', value: 'y' }, { label: '光滑', value: 's' }],
  },
  {
    id: 'gillColor',
    label: '菌褶颜色',
    options: [
      { label: '黑色', value: 'k' }, { label: '棕色', value: 'n' }, { label: '浅黄', value: 'b' }, { label: '巧克力色', value: 'h' },
      { label: '灰色', value: 'g' }, { label: '绿色', value: 'r' }, { label: '橙色', value: 'o' }, { label: '粉色', value: 'p' },
      { label: '紫色', value: 'u' }, { label: '红色', value: 'e' }, { label: '白色', value: 'w' }, { label: '黄色', value: 'y' },
    ],
  },
  {
    id: 'stalkRoot',
    label: '菌柄根部',
    options: [
      { label: '球状', value: 'b' }, { label: '棒状', value: 'c' }, { label: '杯状', value: 'u' },
      { label: '等长', value: 'e' }, { label: '根状', value: 'r' }, { label: '缺失', value: '?' },
    ],
  },
  {
    id: 'stalkSurfaceAbove',
    label: '菌环以上表面',
    options: [{ label: '纤维状', value: 'f' }, { label: '鳞片状', value: 'y' }, { label: '丝状', value: 'k' }, { label: '光滑', value: 's' }],
  },
  {
    id: 'stalkSurfaceBelow',
    label: '菌环以下表面',
    options: [{ label: '纤维状', value: 'f' }, { label: '鳞片状', value: 'y' }, { label: '丝状', value: 'k' }, { label: '光滑', value: 's' }],
  },
  {
    id: 'stalkColorAbove',
    label: '菌环以上颜色',
    options: [
      { label: '棕色', value: 'n' }, { label: '浅黄', value: 'b' }, { label: '肉桂色', value: 'c' }, { label: '灰色', value: 'g' },
      { label: '橙色', value: 'o' }, { label: '粉色', value: 'p' }, { label: '红色', value: 'e' }, { label: '白色', value: 'w' }, { label: '黄色', value: 'y' },
    ],
  },
  {
    id: 'stalkColorBelow',
    label: '菌环以下颜色',
    options: [
      { label: '棕色', value: 'n' }, { label: '浅黄', value: 'b' }, { label: '肉桂色', value: 'c' }, { label: '灰色', value: 'g' },
      { label: '橙色', value: 'o' }, { label: '粉色', value: 'p' }, { label: '红色', value: 'e' }, { label: '白色', value: 'w' }, { label: '黄色', value: 'y' },
    ],
  },
  {
    id: 'ringType',
    label: '菌环类型',
    options: [
      { label: '蛛网状', value: 'c' }, { label: '消失状', value: 'e' }, { label: '喇叭状', value: 'f' },
      { label: '大型', value: 'l' }, { label: '无', value: 'n' }, { label: '垂悬状', value: 'p' },
      { label: '鞘状', value: 's' }, { label: '带状', value: 'z' },
    ],
  },
  {
    id: 'habitat',
    label: '栖息地',
    options: [
      { label: '草地', value: 'g' }, { label: '落叶层', value: 'l' }, { label: '草甸', value: 'm' },
      { label: '路径', value: 'p' }, { label: '城市', value: 'u' }, { label: '荒地', value: 'w' }, { label: '树林', value: 'd' },
    ],
  },
  {
    id: 'population',
    label: '种群分布',
    options: [
      { label: '丰富', value: 'a' }, { label: '集群', value: 'c' }, { label: '大量', value: 'n' },
      { label: '散布', value: 's' }, { label: '数个', value: 'v' }, { label: '独居', value: 'y' },
    ],
  },
  {
    id: 'ringNumber',
    label: '菌环数量',
    options: [{ label: '无', value: 'n' }, { label: '一个', value: 'o' }, { label: '两个', value: 't' }],
  },
  {
    id: 'gillAttachment',
    label: '菌褶附着',
    options: [{ label: '连生', value: 'a' }, { label: '下延', value: 'd' }, { label: '离生', value: 'f' }, { label: '弯生', value: 'n' }],
  },
  {
    id: 'gillSpacing',
    label: '菌褶间距',
    options: [{ label: '近', value: 'c' }, { label: '密', value: 'w' }, { label: '远', value: 'd' }],
  },
  {
    id: 'stalkShape',
    label: '菌柄形状',
    options: [{ label: '渐细', value: 'e' }, { label: '扩大', value: 't' }],
  },
  {
    id: 'veilType',
    label: '菌幕类型',
    options: [{ label: '局部', value: 'p' }, { label: '通用', value: 'u' }],
  },
  {
    id: 'veilColor',
    label: '菌幕颜色',
    options: [{ label: '棕色', value: 'n' }, { label: '橙色', value: 'o' }, { label: '白色', value: 'w' }, { label: '黄色', value: 'y' }],
  },
];

export const ALL_TRAITS: TraitDefinition[] = [...CORE_TRAITS, ...ADVANCED_TRAITS];
