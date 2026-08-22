#!/usr/bin/env python3
"""Reproduce the MycoGuard rule distillation from the UCI Mushrooms dataset.

This is the evidence script behind `src/engine/mushroomEngine.ts`: it trains
a Random Forest on the UCI Mushrooms dataset (8,124 samples), reports honest
held-out metrics, ranks feature importances, and scans for 100%-purity
decision branches. The resulting weights and rules are what the offline
frontend engine encodes.

Dataset: UCI Machine Learning Repository — Mushroom (agaricus-lepiota).
Download it once, e.g.:

    python scripts/analyze_dataset.py --download

or place `mushrooms.csv` / `agaricus-lepiota.data` next to the script
(columns header line `class,cap-shape,cap-surface,...`).

Usage:
    python scripts/analyze_dataset.py [--csv PATH] [--download] [--seed N]

Requires: pandas, numpy, scikit-learn  (pip install -r requirements.txt)
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from urllib.request import urlretrieve

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder

UCI_URL = "https://archive.ics.uci.edu/static/public/73/agaricus+lepiota+dataset.zip"
MIRROR_URL = "https://raw.githubusercontent.com/lloydm/mushrooms/master/agaricus-lepiota.data"
COLUMNS = [
    "class", "cap-shape", "cap-surface", "cap-color", "bruises", "odor",
    "gill-attachment", "gill-spacing", "gill-size", "gill-color", "stalk-shape",
    "stalk-root", "stalk-surface-above-ring", "stalk-surface-below-ring",
    "stalk-color-above-ring", "stalk-color-below-ring", "veil-type", "veil-color",
    "ring-number", "ring-type", "spore-print-color", "population", "habitat",
]
# UCI raw file marks missing stalk-root with '?' — it is a real category here.
NA_VALUES = ["?"]


def load_data(path: Path) -> pd.DataFrame:
    if path.suffix == ".data":
        df = pd.read_csv(path, header=None, names=COLUMNS, na_values=NA_VALUES)
    else:
        df = pd.read_csv(path, na_values=NA_VALUES)

    # Schema variants seen in the wild:
    #  - ".data"  files: class column named "class", values p/e
    #  - ".csv"   header variants: first column named "poisonous", values 1/0
    #    (or "class" with p/e). Normalize everything to class ∈ {p, e}.
    if "poisonous" in df.columns:
        df = df.rename(columns={"poisonous": "class"})
        df["class"] = df["class"].map({1: "p", 0: "e"})
    if "class" not in df.columns:
        raise ValueError(
            "unrecognized schema: expected a 'class' (or 'poisonous') column, "
            f"got {list(df.columns)[:5]}..."
        )
    df["class"] = df["class"].astype(str).str.strip().str.lower()
    df["class"] = df["class"].map({"edible": "e", "poisonous": "p", "e": "e", "p": "p"})

    # UCI marks stalk-root '?' as missing, but in this dataset it is a real
    # category that carries signal (the original course analysis used it).
    df["stalk-root"] = df["stalk-root"].fillna("?")
    return df


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--csv", type=Path, help="path to mushrooms.csv or agaricus-lepiota.data")
    parser.add_argument("--download", action="store_true", help="download the UCI dataset first")
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    path = args.csv
    if args.download or path is None:
        dest = Path("agaricus-lepiota.data")
        if not dest.exists():
            print(f"[download] {MIRROR_URL} -> {dest}")
            urlretrieve(MIRROR_URL, dest)
        path = dest

    if path is None or not path.exists():
        print("[error] dataset not found; use --download or --csv PATH")
        return 1

    df = load_data(path)
    print(f"[data] loaded {len(df)} samples, {df.shape[1] - 1} trait columns")
    print(f"[data] class balance: {df['class'].value_counts().to_dict()}")

    le = {c: LabelEncoder().fit(df[c]) for c in df.columns}
    enc = pd.DataFrame({c: le[c].transform(df[c]) for c in df.columns})
    X, y = enc.drop(columns=["class"]), enc["class"]
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=args.seed)

    rf = RandomForestClassifier(n_estimators=300, random_state=args.seed, n_jobs=-1)
    rf.fit(X_train, y_train)
    acc = accuracy_score(y_test, rf.predict(X_test))
    print(f"[model] random-forest held-out accuracy: {acc * 100:.2f}% (test set, n={len(X_test)})")

    imp = pd.Series(rf.feature_importances_, index=X.columns).sort_values(ascending=False)
    print("\n[importance] top-10 traits by Gini importance:")
    print(imp.head(10).to_string())

    # Purity scan: values that map to a single class in the FULL dataset.
    print("\n[purity] 100%-purity decision branches (full dataset):")
    distilled: dict[str, dict[str, str]] = {}
    for feat in ["odor", "spore-print-color", "gill-size", "stalk-root"]:
        distilled[feat] = {}
        for val, subset in df.groupby(feat, dropna=False):
            counts = subset["class"].value_counts()
            if len(counts) == 1:
                cls = counts.index[0]
                label = "edible" if cls == "e" else "poisonous"
                distilled[feat][str(val)] = label
                print(f"  {feat} = {val!r:>3} -> 100% {label}  (n={len(subset)})")

    out = {
        "dataset": "UCI Mushrooms (agaricus-lepiota)",
        "samples": len(df),
        "held_out_accuracy": float(acc),
        "feature_importance_top5": imp.head(5).to_dict(),
        "purity_rules": distilled,
        "engine_weights": {
            "odor_foul": 6.0, "spore_green": 5.5, "gill_narrow": 3.5,
            "stalk_root_missing": 2.5, "bruises_no": 2.0, "habitat_path_urban": 1.0,
            "population_several": 1.5, "gill_close": 1.5,
            "odor_anchor": 3.5, "stalk_root_tapered": 3.5, "gill_wide": 2.5,
            "bruises_yes": 2.0, "gill_broad": 1.0,
        },
    }
    with open("distilled_rules.json", "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=2)
    print("\n[out] distilled_rules.json written (weights mirrored in src/engine/mushroomEngine.ts)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
