"""Modality-observability guard for the vision channel.

SAFETY CONTRACT — a photograph cannot show every trait the rule engine scores.

Regression this suite guards (pre-fix behaviour, code-level evidence):
`vision.py` listed `odor` in TRAIT_VOCAB and in the prompt's code table, and
`_sanitize` accepted whatever the model returned. Odor is a 6.0-weight
`critical` rule on the risk side AND a 3.5-weight safety anchor on the other,
so a hallucinated "almond odor" read off a still image could push a verdict
towards low risk — while README claimed "qwen-vl-plus reports only what it can
see". Stalk root is the second non-observable trait: it is underground and is
only exposed by uprooting the specimen, which a photo cannot show.

Required: non-observable traits are absent from the prompt and from the
reportable whitelist, and are dropped at the merge layer even when a model
returns them anyway.
"""
import json

from app.services.vision import NON_VISUAL_TRAITS, PROMPT, TRAIT_VOCAB, analyze_image

from .test_vision import PNG_1PX, make_llm

# Traits that cannot be established from a photograph of an intact specimen.
MUST_BE_NON_VISUAL = {"odor", "stalkRoot"}


class TestModalityObservability:
    def test_prompt_does_not_advertise_odor_in_the_code_table(self):
        # The prompt may NAME odor — only to forbid it — but it must not offer a
        # code table for it (that is what invited the model to guess).
        assert "odor: a|l" not in PROMPT
        assert "odor:" not in PROMPT
        assert "气味（odor）无法从照片判断" in PROMPT

    def test_prompt_does_not_offer_a_stalk_root_code_table(self):
        # Same rule as odor: naming stalkRoot to forbid it is fine, offering the
        # `b|c|u|e|r|?` code table for it is what caused the hallucination.
        assert "stalkRoot:" not in PROMPT
        assert "stalkRoot: b|c|u|e|r|?" not in PROMPT
        assert "b|c|u|e|r|?" not in PROMPT
        assert "菌柄根部（stalkRoot）埋在土里" in PROMPT

    def test_whitelist_rejects_non_visual_traits(self):
        assert MUST_BE_NON_VISUAL <= NON_VISUAL_TRAITS
        for trait in NON_VISUAL_TRAITS:
            assert trait not in TRAIT_VOCAB, f"{trait} must not be reportable from a photo"

    def test_the_prompt_code_table_offers_only_reportable_traits(self):
        vocabulary = set(TRAIT_VOCAB)
        table = PROMPT.split("键值必须来自以下代码表：\n", 1)[1].split("规则：", 1)[0]
        offered = {t for t in vocabulary | set(NON_VISUAL_TRAITS) if f"{t}:" in table}
        assert offered <= vocabulary
        assert NON_VISUAL_TRAITS.isdisjoint(offered)
        # The prompt must still be a usable observation checklist.
        assert {"capColor", "capShape", "gillColor"} <= offered

    def test_sanitize_drops_a_hallucinated_odor(self):
        llm = make_llm(
            json.dumps({
                "species_guess": "Chanterelle",
                "confidence": 0.9,
                "traits": {"capColor": "r", "odor": "a", "stalkRoot": "r"},
                "notes": "looks like a chanterelle",
            })
        )
        res = analyze_image(llm, PNG_1PX, "image/png")
        assert res["traits"] == {"capColor": "r"}
        assert any("odor" in w for w in res["warnings"])
        assert any("stalkRoot" in w for w in res["warnings"])

    def test_an_odor_only_response_yields_no_usable_traits(self):
        """A model that reports nothing but non-visual traits must not be able
        to steer the engine at all."""
        llm = make_llm(
            json.dumps({
                "species_guess": None,
                "confidence": 0.8,
                "traits": {"odor": "a"},
                "notes": "",
            })
        )
        res = analyze_image(llm, PNG_1PX, "image/png")
        assert res["traits"] == {}
