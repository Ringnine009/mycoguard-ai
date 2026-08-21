"""Chat logic: rule-first answer from the knowledge base, optional LLM
enhancement (DeepSeek via the OpenAI-compatible endpoint).

Design: retrieval is deterministic and free; the LLM is only used as a
*fluency* layer that is explicitly grounded in the retrieved entry. If the
LLM is unavailable or fails, the system degrades to the rule answer — the
user always gets a useful, safe response.
"""
from __future__ import annotations

FALLBACK_ANSWER = (
    "抱歉，我没有找到与这个问题匹配的安全知识条目。本助手只回答与蘑菇安全相关的"
    "问题（物种辨识、常见误区、应急处理等）。紧急情况请立即联系当地急救中心"
    "（中国大陆拨打 120）。"
)


def answer_question(kb, question: str, llm=None) -> dict:
    entry = kb.search(question)
    if entry is None:
        return {"answer": FALLBACK_ANSWER, "mode": "fallback", "matched": False}

    if llm is not None and getattr(llm, "api_key", ""):
        try:
            prompt = (
                "你是一个蘑菇安全知识助手。请只依据下面的知识库条目回答用户问题，"
                "不要编造事实；若条目信息不足以回答问题，请明确说明。\n\n"
                f"【知识库条目】\n{entry.content}\n\n"
                f"【用户问题】\n{question}\n\n"
                "回答要求：使用中文，简洁，200 字以内。"
            )
            answer = llm.chat_completion(
                messages=[{"role": "user", "content": prompt}],
                temperature=0.4,
            )
            return {"answer": answer.strip(), "mode": "llm", "source": entry.source, "matched": True}
        except Exception:
            # Degrade gracefully to the deterministic rule answer.
            pass

    return {"answer": entry.content, "mode": "rule", "source": entry.source, "matched": True}
