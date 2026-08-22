import { RiskAssessment, VisionResult } from '../types';
import { formatConfidence } from './presentation';

/**
 * Builds the "dual-channel" flow visualization steps shown on the result
 * page after a photo analysis:
 *   📷 视觉识别 → 性状提取 → 规则引擎 → 融合置信度
 */
export interface PipelineStep {
  id: 'vision' | 'traits' | 'engine' | 'fusion';
  kicker: string;
  detail: string;
  active: boolean;
}

const CONSISTENCY_LABEL: Record<string, string> = {
  agree: '一致',
  partial: '部分一致',
  disagree: '存在分歧',
  'n-a': '无视觉置信度',
};

export function buildVisionPipeline(
  vision: VisionResult,
  assessment: RiskAssessment,
  totalTraits: number,
): PipelineStep[] {
  const visionCount = Object.keys(vision.traits).length;
  const consistency = assessment.visionConsistency ?? 'n-a';

  return [
    {
      id: 'vision',
      kicker: '视觉识别',
      detail: vision.speciesGuess ?? '未能识别物种',
      active: true,
    },
    {
      id: 'traits',
      kicker: '性状提取',
      detail: `${visionCount} 项视觉性状`,
      active: true,
    },
    {
      id: 'engine',
      kicker: '规则引擎',
      detail: `合并 ${totalTraits} 项性状`,
      active: true,
    },
    {
      id: 'fusion',
      kicker: '融合置信度',
      detail: `${formatConfidence(assessment.confidence).range} · ${CONSISTENCY_LABEL[consistency]}`,
      active: true,
    },
  ];
}
