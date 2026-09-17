import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BackendHealth, MushroomTraits, RiskAssessment, VisionResult } from './types';
import { computeRiskAssessment } from './engine/mushroomEngine';
import { evaluateVision, mergeTraits } from './engine/merge';
import { SCENARIOS, Scenario } from './engine/scenarios';
import { probeHealth, analyzePhoto, OfflineError, ApiError } from './services/backend';
import { MushroomCanvas } from './components/MushroomCanvas';
import { TraitPanel } from './components/TraitPanel';
import { PhotoCapture, PhotoStage, PreparedPhoto } from './components/PhotoCapture';
import { ResultPanel } from './components/ResultPanel';
import { ChatPanel } from './components/ChatPanel';
import { StatusBadge } from './components/StatusBadge';
import { DisclaimerBanner } from './components/disclaimer';
import { LangProvider, useI18n } from './i18n';
import { Camera, ListChecks, Spinner } from './components/icons';

type Tab = 'manual' | 'photo';

const AppInner: React.FC = () => {
  const { t, lang, setLang } = useI18n();
  const [traits, setTraits] = useState<MushroomTraits>({});
  const [vision, setVision] = useState<VisionResult | null>(null);
  const [assessment, setAssessment] = useState<RiskAssessment | null>(null);
  const [health, setHealth] = useState<BackendHealth | null | undefined>(undefined);
  const [tab, setTab] = useState<Tab>('manual');
  const [photo, setPhoto] = useState<PreparedPhoto | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [photoStage, setPhotoStage] = useState<PhotoStage>('idle');
  const [photoError, setPhotoError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void probeHealth().then((h) => {
      if (!cancelled) setHealth(h);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const filledCount = useMemo(() => Object.values(traits).filter((v) => v).length, [traits]);

  /** Trait keys extracted by the vision model — shown as "vision" badges. */
  const visionTraitKeys = useMemo(
    () => new Set<string>(vision ? Object.keys(vision.traits) : []),
    [vision],
  );

  const handleTraitChange = useCallback((id: keyof MushroomTraits, value: string) => {
    setTraits((prev) => {
      const next = { ...prev };
      if (value) next[id] = value;
      else delete next[id];
      return next;
    });
    setAssessment(null);
  }, []);

  const applyScenario = useCallback((s: Scenario) => {
    setTraits({ ...s.traits });
    setAssessment(null);
    setVision(null);
    setPhotoError(null);
    setPhotoStage('idle');
  }, []);

  const runManual = useCallback(() => {
    setAssessment(computeRiskAssessment(traits));
  }, [traits]);

  const runPhoto = useCallback(async () => {
    if (!photo) return;
    setAnalyzing(true);
    setPhotoStage('analyzing');
    setPhotoError(null);
    try {
      const v = await analyzePhoto(photo.blob, photo.fileName, lang);
      setVision(v);
      // Vision fills observation gaps; manual observations win on conflict.
      setTraits((prev) => mergeTraits(prev, v.traits));
      setAssessment(evaluateVision(traits, v));
      setPhotoStage('extracted');
    } catch (err) {
      setPhotoStage('error');
      if (err instanceof OfflineError) {
        setPhotoError(t('后端视觉服务未配置或不可用——已回退纯离线模式，请改用性状鉴定。'));
      } else if (err instanceof ApiError) {
        setPhotoError(t('视觉分析失败：') + err.message);
      } else {
        setPhotoError(t('视觉分析失败，请重试。'));
      }
      setAssessment(null);
    } finally {
      setAnalyzing(false);
    }
  }, [photo, traits, t]);

  const clearPhoto = useCallback(() => {
    setPhoto(null);
    setVision(null);
    setPhotoError(null);
    setAssessment(null);
    setPhotoStage('idle');
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <div className="brand-logo">🍄</div>
          <div>
            <h1>MycoGuard</h1>
            <p className="tagline">{t('蘑菇安全识别助手 · 不确定性量化的风险分级')}</p>
          </div>
        </div>
        <div className="header-right">
          <button
            type="button"
            className="lang-toggle"
            onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
            aria-label={lang === 'zh' ? 'Switch to English' : '切换到中文'}
          >
            {lang === 'zh' ? 'EN' : '中文'}
          </button>
          <StatusBadge health={health} />
        </div>
      </header>

      <div className="app-main">
        {/* ---- Input panel ---- */}
        <aside className="panel input-panel">
          <div className="mode-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'manual'}
              className={`mode-tab${tab === 'manual' ? ' active' : ''}`}
              onClick={() => setTab('manual')}
            >
              <ListChecks size={15} /> {t('性状鉴定')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'photo'}
              className={`mode-tab${tab === 'photo' ? ' active' : ''}`}
              onClick={() => setTab('photo')}
            >
              <Camera size={15} /> {t('拍照识别')}
            </button>
          </div>

          {tab === 'manual' ? (
            <>
              <div className="scenario-row" aria-label={t('示例场景（一键填充）')}>
                <div className="scenario-title">{t('示例场景（一键填充）')}</div>
                {SCENARIOS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className="scenario-chip"
                    title={t(s.description)}
                    onClick={() => applyScenario(s)}
                  >
                    {t(s.label)}
                  </button>
                ))}
              </div>
              <TraitPanel traits={traits} disabled={analyzing} visionTraits={visionTraitKeys} onChange={handleTraitChange} />
            </>
          ) : (
            <PhotoCapture photo={photo} disabled={analyzing} stage={photoStage} onPhoto={setPhoto} onClear={clearPhoto} />
          )}

          <div style={{ padding: '0 16px 16px' }}>
            {tab === 'manual' ? (
              <button type="button" className="btn primary block" disabled={filledCount < 1 || analyzing} onClick={runManual}>
                {analyzing ? <Spinner size={15} /> : `🍄 ${t('开始分析')}`}
              </button>
            ) : (
              <button
                type="button"
                className="btn primary block"
                disabled={!photo || analyzing}
                onClick={() => void runPhoto()}
              >
                {analyzing ? (
                  <>
                    <Spinner size={15} /> {t('视觉分析中…')}
                  </>
                ) : (
                  `📷 ${t('拍照识别')}`
                )}
              </button>
            )}
            {photoError && <div className="form-error">{photoError}</div>}
            {filledCount < 3 && tab === 'manual' && (
              <div className="form-note" style={{ marginTop: 10 }}>
                {t('至少录入')} <strong>{t('3 项')}</strong> {t('判别性性状才能给出方向性风险判断；不足时结果将强制为「无法判断」。')}
              </div>
            )}
          </div>
        </aside>

        {/* ---- Stage: canvas + result ---- */}
        <main className="panel stage">
          <div className="canvas-area">
            <div className="canvas-shell">
              <MushroomCanvas traits={traits} />
            </div>
          </div>

          {assessment ? (
            <ResultPanel assessment={assessment} traits={traits} vision={vision} photoUrl={photo?.previewUrl} filledTraits={filledCount} />
          ) : (
            <div className="empty-state">
              <div className="es-icon">🍄</div>
              <div className="es-title">{t('等待观察数据')}</div>
              <div className="es-sub">
                {tab === 'manual' ? t('在左侧选择你观察到的蘑菇性状，SVG 形态会实时更新；点击「开始分析」获得不确定性量化的风险分级。') : t('上传蘑菇照片后点击「拍照识别」。识别失败或后端离线时，自动回退为纯离线规则引擎模式。')}
                <br />
                {t('任何结果都仅供教育参考，不构成食用建议。')}
              </div>
            </div>
          )}
        </main>

        {/* ---- Chat ---- */}
        <aside className="panel chat-panel">
          <div className="panel-head">
            <span>{t('安全知识问答')}</span>
            <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}>
              {health?.chat ? t('AI 增强') : t('知识库规则')}
            </span>
          </div>
          <ChatPanel chatEnabled={Boolean(health?.chat)} />
        </aside>
      </div>

      <footer className="app-footer">
        <DisclaimerBanner />
        <div className="footer-tech">
          <span>
            <span className="pulse-dot" />
            {t('离线规则引擎（随机森林逻辑蒸馏 · UCI Mushrooms）')}
          </span>
          <span>{t('风险分级：低 / 中 / 高 / 无法判断')}</span>
          <span>{t('证据充分度区间 ∈ (0, 97%]（非安全概率）')}</span>
          <span>{t('视觉增强：qwen-vl-plus（可选后端）')}</span>
        </div>
      </footer>
    </div>
  );
};

const App: React.FC = () => (
  <LangProvider>
    <AppInner />
  </LangProvider>
);

export default App;
