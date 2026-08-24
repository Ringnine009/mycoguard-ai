import React, { useState } from 'react';
import { ChatReply } from '../types';
import { askChat, ApiError } from '../services/backend';
import { useI18n } from '../i18n';
import { Send } from './icons';

interface ChatMessage {
  role: 'user' | 'bot';
  text: string;
  meta?: string;
}

const MODE_LABEL_ZH: Record<string, string> = {
  llm: 'AI 增强',
  rule: '知识库',
  fallback: '未命中',
};

export const ChatPanel: React.FC<{ chatEnabled: boolean }> = ({ chatEnabled }) => {
  const { t } = useI18n();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);

  const SUGGESTIONS = [
    t('红伞伞白杆杆是什么蘑菇？'),
    t('银器试毒有用吗？'),
    t('误食蘑菇中毒怎么办？'),
    t('怎么区分鸡油菌和假鸡油菌？'),
  ];

  const push = (m: ChatMessage) => setMessages((prev) => [...prev, m]);

  const send = async (question: string) => {
    const q = question.trim();
    if (!q || busy) return;
    setInput('');
    setBusy(true);
    push({ role: 'user', text: q });
    try {
      const reply: ChatReply = await askChat(q);
      const metaBits = [reply.matched ? t(MODE_LABEL_ZH[reply.mode]) : t('知识库未命中')];
      if (reply.matched && reply.mode === 'rule' && reply.source) metaBits.push(reply.source);
      push({
        role: 'bot',
        text: reply.answer,
        meta: metaBits.join(' · '),
      });
    } catch (err) {
      push({
        role: 'bot',
        text: err instanceof ApiError ? `${t('请求失败：')}${err.message}` : t('网络错误，请稍后重试。'),
        meta: 'error',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="chat-scroll">
        {messages.length === 0 ? (
          <div className="chat-empty">
            <div style={{ fontSize: 26, marginBottom: 8 }}>🍄</div>
            {t('内置蘑菇安全知识库（公开常识性内容）。')}
            <br />
            {chatEnabled ? t('在线增强模式：命中条目后由 AI 润色回答。') : t('离线模式：仅知识库规则回答。')}
            <br />
            {t('点击下方问题试试。')}
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={`chat-msg ${m.role}`}>
              {m.text}
              {m.meta && (
                <div className="msg-meta">
                  <span className={`mode-chip ${m.meta.includes('AI') ? 'llm' : m.meta === t('知识库未命中') ? 'fallback' : 'rule'}`}>
                    {m.meta}
                  </span>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <div className="suggest-row">
        {SUGGESTIONS.map((s) => (
          <button key={s} type="button" className="suggest-chip" onClick={() => void send(s)}>
            {s}
          </button>
        ))}
      </div>

      <div className="chat-input-row">
        <input
          className="chat-input"
          placeholder={t('询问蘑菇安全问题…')}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void send(input)}
          disabled={busy}
        />
        <button type="button" className="chat-send" onClick={() => void send(input)} disabled={busy || !input.trim()} aria-label={t('发送')}>
          <Send size={16} />
        </button>
      </div>
    </>
  );
};
