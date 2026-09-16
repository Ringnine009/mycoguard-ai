import { RiskAssessment, VisionResult } from '../types';
import { Lang, translate } from '../i18n';
import { formatConfidence } from './presentation';

/**
 * Builds the "dual-channel" flow visualization steps shown on the result
 * page after a photo analysis (bilingual, default zh):
 *   📷 vision → traits → rule engine → fused evidence interval
 */
export interface PipelineStep {
  id: 'vision' | 'traits' | 'engine' | 'fusion';
  kicker: string;
  detail: string;
  active: boolean;
}

const CONSISTENCY_ZH: Record<string, string> = {
  agree: '一致',
  partial: '部分一致',
  disagree: '存在分歧',
  'n-a': '无视觉置信度',
};

export function buildVisionPipeline(
  vision: VisionResult,
  assessment: RiskAssessment,
  totalTraits: number,
  lang: Lang = 'zh',
): PipelineStep[] {
  const visionCount = Object.keys(vision.traits).length;
  const consistency = assessment.visionConsistency ?? 'n-a';

  return [
    {
      id: 'vision',
      kicker: translate('视觉识别', lang),
      detail: vision.speciesGuess ?? translate('未能识别物种', lang),
      active: true,
    },
    {
      id: 'traits',
      kicker: translate('性状提取', lang),
      detail: `${visionCount} ${translate('项视觉性状', lang)}`,
      active: true,
    },
    {
      id: 'engine',
      kicker: translate('规则引擎', lang),
      detail: `${translate('合并', lang)} ${totalTraits} ${translate('项性状', lang)}`,
      active: true,
    },
    {
      id: 'fusion',
      kicker: translate('融合证据区间', lang),
      detail: `${formatConfidence(assessment.confidence).range} · ${translate(CONSISTENCY_ZH[consistency], lang)}`,
      active: true,
    },
  ];
}
