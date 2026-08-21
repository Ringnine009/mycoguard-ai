import React, { useState } from 'react';
import { ChatReply } from '../types';
import { askChat, ApiError } from '../services/backend';
import { Send } from './icons';

interface ChatMessage {
  role: 'user' | 'bot';
  text: string;
  meta?: string;
}

const SUGGESTIONS = [
  '红伞伞白杆杆是什么蘑菇？',
  '银器试毒有用吗？',
  '误食蘑菇中毒怎么办？',
  '怎么区分鸡油菌和假鸡油菌？',
];

const MODE_LABEL: Record<string, string> = {
  llm: 'AI 增强',
  rule: '知识库',
  fallback: '未命中',
};

export const ChatPanel: React.FC<{ chatEnabled: boolean }> = ({ chatEnabled }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);

  const push = (m: ChatMessage) => setMessages((prev) => [...prev, m]);

  const send = async (question: string) => {
    const q = question.trim();
    if (!q || busy) return;
    setInput('');
    setBusy(true);
    push({ role: 'user', text: q });
    try {
      const reply: ChatReply = await askChat(q);
      const metaBits = [reply.matched ? MODE_LABEL[reply.mode] : '知识库未命中'];
      if (reply.matched && reply.mode === 'rule' && reply.source) metaBits.push(reply.source);
      push({
        role: 'bot',
        text: reply.answer,
        meta: metaBits.join(' · '),
      });
    } catch (err) {
      push({
        role: 'bot',
        text: err instanceof ApiError ? `请求失败：${err.message}` : '网络错误，请稍后重试。',
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
            内置蘑菇安全知识库（公开常识性内容）。
            <br />
            {chatEnabled ? '在线增强模式：命中条目后由 AI 润色回答。' : '离线模式：仅知识库规则回答。'}
            <br />
            点击下方问题试试。
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={`chat-msg ${m.role}`}>
              {m.text}
              {m.meta && (
                <div className="msg-meta">
                  <span className={`mode-chip ${m.meta.includes('AI') ? 'llm' : m.meta === '知识库未命中' ? 'fallback' : 'rule'}`}>
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
          placeholder="询问蘑菇安全问题…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void send(input)}
          disabled={busy}
        />
        <button type="button" className="chat-send" onClick={() => void send(input)} disabled={busy || !input.trim()} aria-label="发送">
          <Send size={16} />
        </button>
      </div>
    </>
  );
};
