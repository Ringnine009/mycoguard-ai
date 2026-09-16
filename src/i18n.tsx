import React, { createContext, useContext, useState } from 'react';

/**
 * MycoGuard i18n — minimal, dependency-free bilingual layer (zh default).
 *
 * Design:
 *  - Components keep their Chinese literals and call `t('中文')`; unknown
 *    keys fall back to the Chinese input, so the UI is always safe.
 *  - Rule labels/details (27 rules) live in RULE_EN keyed by rule id.
 *  - The rule engine itself stays zh-internal (its outputs are translated
 *    at presentation time); vision model text (species guess, notes) is
 *    deliberately left as-is.
 */

export type Lang = 'zh' | 'en';

const TRANSLATIONS: Record<string, string> = {
  // ---------- Header ----------
  '蘑菇安全识别助手 · 不确定性量化的风险分级': 'Mushroom safety assistant · uncertainty-quantified risk grading',
  '检测后端…': 'Detecting backend…',

  // ---------- Status badge ----------
  '纯离线模式 · 规则引擎': 'Offline · rule engine',
  '在线增强 · 视觉 + 问答': 'Enhanced · vision + chat',
  '在线增强 · 视觉': 'Enhanced · vision',
  '在线增强 · 问答': 'Enhanced · chat',

  // ---------- Tabs & buttons ----------
  '性状鉴定': 'Trait ID',
  '拍照识别': 'Photo ID',
  '开始分析': 'Analyze',
  '视觉分析中…': 'Analyzing…',
  '更换照片': 'Change photo',
  '移除照片': 'Remove photo',

  // ---------- Scenarios ----------
  '示例场景（一键填充）': 'Example scenarios (one click)',
  '大青褶伞特征组合': 'Chlorophyllum molybdites',
  '绿色孢子印 → 高风险（草坪常见中毒种）': 'Green spore print → high risk (lawn look-alike)',
  '鸡油菌形态组合': 'Chanterelle-like',
  '多项安全锚点 → 低风险（仍非食用建议）': 'Safety anchors → low risk (not dietary advice)',
  '毒蝇伞外观组合': 'Amanita muscaria look',
  '仅外观性状 → 无法判断（不确定性的价值）': 'Appearance only → unknown (uncertainty by design)',
  '混合信号组合': 'Mixed signals',
  '正负信号并存 → 中风险': 'Conflicting signals → medium risk',
  '信息不足示例': 'Sparse input',
  '仅 2 项性状 → 强制无法判断（输入门槛）': 'Only 2 traits → forced unknown (input threshold)',

  // ---------- Trait panel ----------
  '核心关键特征': 'Core traits',
  '辅助结构特征（': 'Advanced traits (',
  '收起': 'collapse',
  '项，展开': ' items, expand',
  '辅助观察项': 'Advanced observations',
  '— 未观察 —': '— not observed —',
  '已观察': 'Observed',
  '/ 22 项': '/ 22 traits',
  '（含视觉': ' (incl. vision ',
  '项）': ' items)',
  '≥ 3 项才可给出方向性判断': '≥ 3 traits needed for a directional verdict',
  '最强判别性状（统计信息增益最高）': 'Strongest discriminator (highest info gain)',
  '绿色孢子印 = 强风险信号': 'Green spore print = strong risk signal',
  '气味': 'Odor',
  '孢子印颜色': 'Spore print color',
  '菌褶大小': 'Gill size',
  '受伤是否变色': 'Bruising / color change',
  '菌盖形状': 'Cap shape',
  '菌盖颜色': 'Cap color',
  '菌盖表面': 'Cap surface',
  '菌褶颜色': 'Gill color',
  '菌柄根部': 'Stalk root',
  '菌环以上表面': 'Surface above ring',
  '菌环以下表面': 'Surface below ring',
  '菌环以上颜色': 'Color above ring',
  '菌环以下颜色': 'Color below ring',
  '菌环类型': 'Ring type',
  '栖息地': 'Habitat',
  '种群分布': 'Population',
  '菌环数量': 'Ring number',
  '菌褶附着': 'Gill attachment',
  '菌褶间距': 'Gill spacing',
  '菌柄形状': 'Stalk shape',
  '菌幕类型': 'Veil type',
  '菌幕颜色': 'Veil color',
  // odor options
  '杏仁味': 'Almond', '茴香味': 'Anise', '杂酚油味': 'Creosote', '鱼腥味': 'Fishy', '恶臭': 'Foul',
  '霉味': 'Musty', '无味': 'None', '刺激性': 'Pungent', '辛辣': 'Spicy',
  // spore print options
  '黑色': 'Black', '棕色': 'Brown', '浅黄色': 'Buff', '巧克力色': 'Chocolate', '绿色': 'Green',
  '橙色': 'Orange', '紫色': 'Purple', '白色': 'White', '黄色': 'Yellow', '红色': 'Red', '灰色': 'Gray', '粉色': 'Pink',
  // gill size / bruising / shapes
  '宽': 'Broad', '窄': 'Narrow', '是': 'Yes', '否': 'No',
  '钟形': 'Bell', '锥形': 'Conical', '凸面': 'Convex', '平展': 'Flat', '中心凸起': 'Umbonate', '中心凹陷': 'Depressed',
  '纤维状': 'Fibrous', '凹槽状': 'Grooved', '鳞片状': 'Scaly', '光滑': 'Smooth',
  '球状': 'Bulbous', '棒状': 'Club', '杯状': 'Cup', '等长': 'Equal', '根状': 'Rooting', '缺失': 'Missing',
  '丝状': 'Silky',
  '蛛网状': 'Cortinate', '消失状': 'Evanescent', '喇叭状': 'Flaring', '大型': 'Large', '无': 'None',
  '垂悬状': 'Pendant', '鞘状': 'Sheathing', '带状': 'Zone',
  '草地': 'Grass', '落叶层': 'Leaf litter', '草甸': 'Meadows', '路径': 'Paths', '城市': 'Urban', '荒地': 'Waste', '树林': 'Woods',
  '丰富': 'Abundant', '集群': 'Clustered', '大量': 'Numerous', '散布': 'Scattered', '数个': 'Several', '独居': 'Solitary',
  '一个': 'One', '两个': 'Two',
  '连生': 'Attached', '下延': 'Decurrent', '离生': 'Free', '弯生': 'Adnate',
  '近': 'Close', '密': 'Dense', '远': 'Distant',
  '渐细': 'Tapering', '扩大': 'Enlarging',
  '局部': 'Partial', '通用': 'Universal',
  '肉桂色': 'Cinnamon',

  // ---------- Photo mode ----------
  '点击或拖入蘑菇照片': 'Click or drop a mushroom photo',
  'jpeg / png / webp · 最大 8MB': 'jpeg / png / webp · max 8MB',
  '需后端视觉服务；不可用时自动回退离线模式': 'Needs the backend vision service; falls back to offline mode when unavailable',
  '请上传图片文件（jpeg / png / webp）。': 'Please upload an image (jpeg / png / webp).',
  '图片超过 8MB 上限，请压缩后重试。': 'Image exceeds the 8MB limit; compress and retry.',
  '图片处理失败。': 'Image processing failed.',
  '图片编码失败': 'Image encoding failed',
  'canvas 不可用': 'canvas unavailable',
  '试用样例（无相机环境）': 'Try a sample (no camera needed)',
  '图片预处理中…': 'Preparing image…',
  '上传中 · 视觉模型分析中…': 'Uploading · vision model analyzing…',
  '✓ 视觉性状已提取': '✓ visual traits extracted',
  '分析失败，请重试': 'Analysis failed, please retry',
  '原尺寸': 'original size',
  '样例加载失败（HTTP': 'Sample load failed (HTTP',
  '样例加载失败。': 'Sample load failed.',
  '视觉识别通过后端代理调用多模态模型（qwen-vl-plus），模型只报告照片里能看见的性状（气味、菌柄根部这类无法从照片判断的性状不会被报告）；\n不足 3 项时同样强制「无法判断」。模型输出仅作为观察补充，不改变离线规则引擎的风险语言。':
    'Vision analysis is proxied through the backend (qwen-vl-plus); the model reports only traits visible in the photo (traits a photo cannot show, such as odor or the underground stalk root, are never reported). Fewer than 3 traits still force "unknown". Model output is a supplementary observation and never changes the rule engine\u2019s risk language.',
  '模型报告了无法从照片观察的性状，已丢弃：': 'The model reported traits that a photo cannot show; discarded: ',
  '气味与菌柄根部请手动录入（照片无法判断）。':
    'Enter odor and stalk root manually — a photo cannot establish them.',
  '至少录入': 'Enter at least',
  '3 项': '3',
  '判别性性状才能给出方向性风险判断；不足时结果将强制为「无法判断」。': 'discriminative traits to get a directional risk verdict; otherwise the result is forced to "unknown".',
  '后端视觉服务未配置或不可用——已回退纯离线模式，请改用性状鉴定。': 'Backend vision service is not configured or unavailable — fell back to offline mode; use Trait ID instead.',
  '视觉分析失败：': 'Vision analysis failed: ',
  '视觉分析失败，请重试。': 'Vision analysis failed, please retry.',

  // ---------- Result panel ----------
  '风险分级结果（不确定性量化）': 'Risk assessment (uncertainty-quantified)',
  '信息不足，已强制「无法判断」': 'Insufficient input — forced to "unknown"',
  '证据充分度': 'Evidence strength',
  '该数字表示证据充分度，不是安全概率，也不是可食用的可能性。':
    'This number is evidence strength — it is not a probability of safety, and not a chance that the mushroom is edible.',
  '未发现强风险信号——这不等于可以食用。':
    'No strong risk signal found — that does not mean it is safe to eat.',
  '区间因双通道分歧加宽（证据强度不可按点估计理解）':
    'Interval widened by channel disagreement (do not read the point estimate as strength).',
  '双通道分析链路': 'Dual-channel pipeline',
  '视觉识别': 'Vision',
  '性状提取': 'Traits',
  '规则引擎': 'Rule engine',
  '融合证据区间': 'Fused evidence interval',
  '疑似物种：': 'Species guess: ',
  '（模型自评': ' (model confidence ',
  '%）': '%)',
  '视觉与规则：一致': 'Vision & rules: agree',
  '视觉与规则：部分一致': 'Vision & rules: partial',
  '视觉与规则：存在分歧': 'Vision & rules: conflict',
  '视觉：未提供有效信息': 'Vision: no usable signal',
  '一致': 'agree',
  '部分一致': 'partial',
  '存在分歧': 'conflict',
  '无视觉置信度': 'no vision confidence',
  '未能识别物种': 'species not identified',
  '项视觉性状': 'vision traits',
  '合并': 'merged',
  '项性状': 'traits',
  '已录入': 'Entered',
  '项性状，不足以给出方向性判断——这本身就是一个安全信号。': 'trait(s) — not enough for a directional verdict; that itself is a safety signal.',
  '请补充': 'Add key traits such as',
  '气味、孢子印颜色、菌褶大小': 'odor, spore print, gill size',
  '等关键性状后再分析。': 'and re-analyze.',
  '命中的规则（可解释性）': 'Rules fired (explainability)',
  '专家解读（离线可解释性）': 'Expert note (offline)',
  '推理说明': 'Reasoning',
  '分析所用照片 · 点击放大': 'Analyzed photo · click to enlarge',
  '分析所用照片': 'Analyzed photo',
  '待分析蘑菇照片预览': 'Mushroom photo preview',
  '区间': 'interval',
  '关闭': 'Close',

  // ---------- Risk levels ----------
  '低风险': 'Low risk',
  '中风险': 'Medium risk',
  '高风险': 'High risk',
  '无法判断': 'Unknown',
  // guidance (engine GUIDANCE, zh)
  '低风险（统计倾向安全）：仅表示观测特征与安全类样本一致，绝不构成食用建议。食用前请务必由真菌学专家确认。':
    'Low risk (statistically leans safe): only means the observed traits match safe-class samples. This is never dietary advice — always confirm with a mycologist before consuming.',
  '中风险（信号混合）：请补充气味、孢子印颜色、菌褶等关键性状，或咨询当地真菌学会/植物园。':
    'Medium risk (mixed signals): add key traits (odor, spore print, gills) or consult a local mycological society / botanical garden.',
  '高风险：强烈建议不要食用，也不要徒手接触后进食。请停止采集并咨询专业人士。':
    'High risk: strongly advised NOT to eat, and not to handle it before eating. Stop collecting and consult a professional.',
  '无法判断：信息不足。请不要食用该蘑菇，先补充观察数据，或改用拍照识别寻求第二意见。':
    'Unknown: insufficient information. Do not eat this mushroom; gather more observations or try photo ID for a second opinion.',
  // reasoning (engine REASONING, zh)
  '观测特征的统计倾向与低风险样本一致，但野外鉴别存在不确定性；任何结论都只是概率性参考。':
    'The observed traits statistically match low-risk samples, but field identification is uncertain; any conclusion is only a probabilistic reference.',
  '风险信号相互混合（既有偏向安全的特征，也有偏向风险的信号），无法给出明确的风险倾向。':
    'Risk signals are mixed (both safety-leaning and risk-leaning traits); no clear directional verdict is possible.',
  '命中了多个强风险信号，统计特征与高风险物种一致。强烈建议按最坏情况处理：不要食用。':
    'Multiple strong risk signals fired; the statistical profile matches high-risk species. Treat this as the worst case: do not eat.',
  '输入不足或缺少判别性性状，无法给出任何风险倾向——这本身就是一个安全信号。':
    'Insufficient input or no discriminative traits; no risk tendency can be given — that itself is a safety signal.',

  // ---------- Expert narrative (sentences) ----------
  '已观察性状：': 'Observed traits: ',
  '命中的统计规则：': 'Rules fired: ',
  '（强信号）': ' (strong)',
  '（警示）': ' (warning)',
  '（参考）': ' (info)',
  '建议至少补充 3 项判别性关键性状（气味、孢子印颜色、菌褶等）后重新分析。':
    'Add at least 3 discriminative traits (odor, spore print, gills) and re-analyze.',
  '严禁在未经过线下专业鉴定前食用野生真菌。本工具仅供参考，不构成食用建议。':
    'Never eat a wild mushroom without a professional identification. This tool is for reference only and does not constitute dietary advice.',

  // ---------- Empty state ----------
  '等待观察数据': 'Waiting for observations',
  '在左侧选择你观察到的蘑菇性状，SVG 形态会实时更新；点击「开始分析」获得不确定性量化的风险分级。':
    'Pick traits you observe on the left; the SVG renders live. Click "Analyze" for an uncertainty-quantified risk verdict.',
  '上传蘑菇照片后点击「拍照识别」。识别失败或后端离线时，自动回退为纯离线规则引擎模式。':
    'Upload a mushroom photo and click "Photo ID". On failure or offline backend, the app falls back to the pure-offline rule engine.',
  '任何结果都仅供教育参考，不构成食用建议。': 'Every result is educational reference only — never dietary advice.',

  // ---------- Chat ----------
  '安全知识问答': 'Safety Q&A',
  'AI 增强': 'AI enhanced',
  '知识库规则': 'Knowledge base',
  '询问蘑菇安全问题…': 'Ask a mushroom safety question…',
  '红伞伞白杆杆是什么蘑菇？': 'What is the "red cap, white stem" mushroom?',
  '银器试毒有用吗？': 'Does the silver spoon test work?',
  '误食蘑菇中毒怎么办？': 'What to do after eating a toxic mushroom?',
  '怎么区分鸡油菌和假鸡油菌？': 'How to tell chanterelle from false chanterelle?',
  '内置蘑菇安全知识库（公开常识性内容）。': 'Built-in mushroom safety knowledge base (public commonsense content).',
  '在线增强模式：命中条目后由 AI 润色回答。': 'Enhanced mode: matched entries are polished by AI.',
  '离线模式：仅知识库规则回答。': 'Offline mode: answers come from the knowledge base directly.',
  '点击下方问题试试。': 'Try one of the questions below.',
  '请求失败：': 'Request failed: ',
  '网络错误，请稍后重试。': 'Network error, please retry.',
  '知识库未命中': 'no match',
  '发送': 'Send',

  // ---------- Footer ----------
  '离线规则引擎（随机森林逻辑蒸馏 · UCI Mushrooms）': 'Offline rule engine (RF logic distillation · UCI Mushrooms)',
  '风险分级：低 / 中 / 高 / 无法判断': 'Risk tiers: low / medium / high / unknown',
  '证据充分度区间 ∈ (0, 97%]（非安全概率）': 'evidence-strength interval ∈ (0, 97%] (not a safety probability)',
  '视觉增强：qwen-vl-plus（可选后端）': 'vision boost: qwen-vl-plus (optional backend)',

  // ---------- Canvas captions ----------
  'Side · 形态视图': 'Side · morphology',
  'Under · 菌褶视图': 'Under · gills',

  // ---------- Disclaimer ----------
  '免责声明': 'Disclaimer',
  '本工具为机器学习辅助参考，仅供参考，不构成食用建议。野外蘑菇识别存在不确定性，任何结论都不能替代真菌学专家的鉴定；请勿仅凭本工具结果食用野生蘑菇。':
    'This tool is a machine-learning reference only. Wild-mushroom identification is uncertain and no conclusion here replaces a mycologist\u2019s identification; never eat wild mushrooms based on this tool alone.',
};

/** English labels/details for the 27 engine rules, keyed by rule id. */
export const RULE_EN: Record<string, { label: string; detail: string }> = {
  'odor-foul': { label: 'Foul odor signal', detail: 'Foul/pungent/fishy/creosote/musty odors were 100% high-risk class in the dataset (n=3,796) — statistical, not absolute.' },
  'spore-green': { label: 'Green spore print', detail: 'Green spore print is the hallmark of Chlorophyllum molybdites; 72/72 samples were high-risk class (statistical).' },
  'gill-color-buff': { label: 'Buff gills signal', detail: 'Buff gill color was 100% high-risk class in the dataset (n=1,728); field color is light-sensitive, treat as a hint.' },
  'gill-color-green': { label: 'Green gills signal', detail: 'Green gills (UCI code r) were 100% high-risk class in the dataset (n=24, small sample).' },
  'ring-large': { label: 'Large annulus signal', detail: 'Large pendant ring was 100% high-risk class in the dataset (n=1,296) — statistical, not absolute.' },
  'ring-type-none': { label: 'No ring signal', detail: 'Absence of a ring was 100% high-risk class in the dataset (n=36, small sample).' },
  'ring-number-none': { label: 'No ring count signal', detail: 'Ring count "none" was 100% high-risk class in the dataset (n=36, small sample).' },
  'gill-narrow': { label: 'Narrow gills', detail: 'Narrow gills were 88.5% high-risk class in the dataset.' },
  'gill-close': { label: 'Close gills', detail: 'Close gill spacing was 55.8% high-risk class in the dataset.' },
  'root-missing': { label: 'Missing stalk root', detail: 'Missing root was 71.0% high-risk class in the dataset.' },
  'bruises-no': { label: 'No bruising', detail: 'No color change on bruising was 69.3% high-risk class in the dataset.' },
  'habitat-path': { label: 'Path habitat', detail: 'Paths habitat was 88.1% high-risk class in the dataset.' },
  'habitat-urban': { label: 'Urban habitat', detail: 'Urban habitat was 73.9% high-risk class in the dataset.' },
  'population-several': { label: 'Several in population', detail: 'Several-individual populations were 70.5% high-risk class in the dataset.' },
  'cap-umbonate': { label: 'Umbonate cap', detail: 'Umbonate caps were 72.5% high-risk class in the dataset.' },
  'stalk-above-buff': { label: 'Buff stalk above ring', detail: 'Buff color above the ring was 100% high-risk class in the dataset (n=432).' },
  'odor-safety-anchor': { label: 'Odor safety anchor', detail: 'Almond/anise odors had no risk samples in the dataset (n=800) — statistical reference, not a safety conclusion.' },
  'gill-color-anchor': { label: 'Gill color anchor', detail: 'Red/orange gills had no risk samples in the dataset (n=96/64) — statistical reference only.' },
  'ring-flaring': { label: 'Flaring ring', detail: 'Flaring rings had no risk samples in the dataset (n=48).' },
  'gill-broad': { label: 'Broad gills', detail: 'Broad gills were 69.9% safe-class in the dataset.' },
  'gill-wide': { label: 'Wide gill spacing', detail: 'Wide gill spacing was 91.5% safe-class in the dataset.' },
  'root-tapered': { label: 'Rooting stalk anchor', detail: 'Rooting stalks were 100% safe-class in the dataset (n=192) — statistical reference, not a safety conclusion.' },
  'root-club': { label: 'Club root', detail: 'Club-shaped roots were 92.1% safe-class in the dataset.' },
  'bruises-yes': { label: 'Bruising reference', detail: 'Color change on bruising was 81.5% safe-class in the dataset.' },
  'habitat-waste': { label: 'Waste habitat anchor', detail: 'Waste habitats were 100% safe-class in the dataset (n=192).' },
  'population-anchor': { label: 'Population anchor', detail: 'Abundant/numerous populations were 100% safe-class in the dataset (n=784) — statistical reference only.' },
  'cap-sunken': { label: 'Depressed cap', detail: 'Depressed caps were 100% safe-class in the dataset (n=32, small sample).' },
};

export function translate(key: string, lang: Lang): string {
  if (lang === 'zh') return key;
  return TRANSLATIONS[key] ?? key;
}

/** English label/detail for an engine rule hit (fallback: Chinese). */
export function ruleEn(id: string, lang: Lang): { label?: string; detail?: string } {
  if (lang === 'zh') return {};
  return RULE_EN[id] ?? {};
}

interface I18nValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string) => string;
}

const LangContext = createContext<I18nValue>({ lang: 'zh', setLang: () => {}, t: (k) => k });

export const LangProvider: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const [lang, setLang] = useState<Lang>('zh');
  const t = (key: string) => translate(key, lang);
  return <LangContext.Provider value={{ lang, setLang, t }}>{children}</LangContext.Provider>;
};

export function useI18n(): I18nValue {
  return useContext(LangContext);
}
