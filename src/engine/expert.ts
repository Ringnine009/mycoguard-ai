import { MushroomTraits, RiskAssessment } from '../types';
import { ALL_TRAITS } from '../constants';

/**
 * Deterministic "expert explanation" for the result page.
 *
 * The original course app called Gemini for a rich expert paragraph; this is
 * the offline replacement — built purely from the rule hits and observed
 * traits, with zero network. It is at least as informative as the old one
 * (it names the specific signals + the mandatory safety sentence) and never
 * claims edibility or toxicity.
 */

const LEVEL_OPENING: Record<string, string> = {
  high: '本次判定命中了强风险信号，统计特征与高风险类样本高度一致。请以最坏情况对待：不要采食，也不要徒手接触后进食。建议保留完整样本（连同菌柄基部、菌托等特征），尽快咨询真菌学专家或当地疾控/植物园。',
  medium: '本次观测的风险信号相互混合：既有偏向安全的特征，也有偏向风险的信号，无法给出明确倾向。野外相似种众多，单一特征不足以定论；建议补充气味、孢子印颜色、菌褶等关键性状，或在专家指导下复检。',
  low: '本次观测的统计特征与安全类样本一致，但外观相似的物种众多，仅凭性状无法排除风险。请保留样本，并请真菌学专家做形态学（必要时显微/分子）鉴定后再做决定。',
  unknown: '本次输入的信息不足（性状过少，或缺少判别力强的关键性状），无法建立可靠的风险判别——这本身就是一个安全信号：请勿仅凭现有信息判断，先补充观察数据或寻求专家帮助。',
};

const SEVERITY_WORD: Record<string, string> = {
  critical: '强信号',
  warning: '警示',
  info: '参考',
};

export function buildExpertNarrative(assessment: RiskAssessment, traits: MushroomTraits): string {
  const observed = ALL_TRAITS.filter((t) => traits[t.id])
    .map((t) => {
      const opt = t.options.find((o) => o.value === traits[t.id]);
      return `${t.label}=${opt ? opt.label : traits[t.id]}`;
    })
    .join('，');

  const signals = assessment.ruleHits
    .map((h) => `${h.label}（${SEVERITY_WORD[h.severity] ?? '参考'}）`)
    .join('；');

  const parts: string[] = [LEVEL_OPENING[assessment.riskLevel]];
  if (observed) parts.push(`已观察性状：${observed}。`);
  if (signals) parts.push(`命中的统计规则：${signals}。`);
  if (assessment.incomplete) {
    parts.push('建议至少补充 3 项判别性关键性状（气味、孢子印颜色、菌褶等）后重新分析。');
  }
  parts.push('严禁在未经过线下专业鉴定前食用野生真菌。本工具仅供参考，不构成食用建议。');
  return parts.join('\n');
}
