"""Tests for the built-in safety-knowledge retrieval."""
import pytest

from app.services.knowledge import KnowledgeBase
from app.knowledge.entries import ENTRIES


@pytest.fixture()
def kb():
    return KnowledgeBase(ENTRIES)


def test_all_entries_have_required_fields():
    for e in ENTRIES:
        assert e["id"]
        assert e["title"]
        assert e["keywords"]
        assert e["content"]
        assert e["source"]


def test_retrieves_amanita_muscaria_by_meme_keywords(kb):
    hit = kb.search("红伞伞白杆杆是什么蘑菇")
    assert hit is not None
    assert hit.id == "species-amanita-muscaria"


def test_retrieves_silver_myth(kb):
    hit = kb.search("银器试毒到底有没有用")
    assert hit is not None
    assert hit.id == "myth-silver-spoon"


def test_retrieves_first_aid(kb):
    hit = kb.search("误食蘑菇中毒了怎么办")
    assert hit is not None
    assert hit.id == "firstaid-intoxication"


def test_retrieves_chanterelle_by_common_name(kb):
    hit = kb.search("鸡油菌怎么和假鸡油菌区分")
    assert hit is not None
    assert hit.id == "edible-chanterelle"


def test_retrieves_death_cap(kb):
    hit = kb.search("死亡帽蘑菇")
    assert hit is not None
    assert hit.id == "species-amanita-phalloides"


def test_no_match_returns_none(kb):
    assert kb.search("今天天气怎么样") is None


def test_english_keyword_match(kb):
    hit = kb.search("Is the silver spoon test reliable?")
    assert hit is not None
    assert hit.id == "myth-silver-spoon"
