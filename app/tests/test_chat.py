"""Tests for the chat endpoint logic: rule-first, optional LLM enhancement."""
import pytest

from app.services.chat import answer_question
from app.services.knowledge import KnowledgeBase
from app.knowledge.entries import ENTRIES


class FakeLLM:
    """A fake LLM client that satisfies the chat interface (api_key + chat_completion)."""

    def __init__(self, reply="canned answer", api_key="sk-fake", fail=False):
        self.api_key = api_key
        self.reply = reply
        self.fail = fail
        self.calls = 0

    def chat_completion(self, messages, temperature=0.4, response_format=None):
        self.calls += 1
        if self.fail:
            raise RuntimeError("upstream down")
        return self.reply


@pytest.fixture()
def kb():
    return KnowledgeBase(ENTRIES)


def test_unknown_question_returns_fallback(kb):
    reply = answer_question(kb, "今天天气怎么样")
    assert reply["matched"] is False
    assert reply["mode"] == "fallback"
    assert reply["answer"]


def test_rule_mode_returns_entry_content(kb):
    reply = answer_question(kb, "银器试毒有用吗")
    assert reply["matched"] is True
    assert reply["mode"] == "rule"
    assert reply["source"]
    assert "银" in reply["answer"]


def test_llm_mode_used_when_available(kb):
    llm = FakeLLM(reply="银器试毒不可靠。")
    reply = answer_question(kb, "银器试毒有用吗", llm=llm)
    assert reply["matched"] is True
    assert reply["mode"] == "llm"
    assert reply["answer"] == "银器试毒不可靠。"
    assert llm.calls == 1


def test_llm_failure_falls_back_to_rule(kb):
    llm = FakeLLM(fail=True)
    reply = answer_question(kb, "银器试毒有用吗", llm=llm)
    assert reply["matched"] is True
    assert reply["mode"] == "rule"
    assert reply["answer"]


def test_empty_question_returns_fallback(kb):
    reply = answer_question(kb, "")
    assert reply["matched"] is False
