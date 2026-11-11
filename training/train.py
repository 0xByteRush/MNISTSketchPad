#!/usr/bin/env python3
"""Train the booth's tiny MNIST network and export everything the app needs.

    python training/train.py

Writes (paths relative to the repo root):
    src/model/mnist-mlp.json      weights, format "mnist-mlp/v1" (AGENTS.md section 5.3)
    src/model/samples.json        3 test digits per class
    tests/fixtures/parity.json    200 test digits + PyTorch probabilities for the parity test

Input contract: 28x28, row-major, values in [0, 1], ink = 1. No mean/std normalization.
"""
import argparse
import base64
import datetime
import json
import math
import pathlib

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torchvision import datasets

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "training" / "data"


def load(train: bool):
    ds = datasets.MNIST(str(DATA), train=train, download=True)
    x = ds.data.float().div(255.0).unsqueeze(1)  # [N, 1, 28, 28] in [0, 1], ink = 1
    return x, ds.targets.clone()


def augment(x: torch.Tensor, g: torch.Generator) -> torch.Tensor:
    """Make MNIST look more like finger drawings: rotate, scale, shear, shift, thicken or thin."""
    n = x.shape[0]

    def uniform(lo, hi):
        return lo + (hi - lo) * torch.rand(n, generator=g)

    angle = uniform(-12.0, 12.0) * math.pi / 180.0
    scale = uniform(0.85, 1.15)
    shear = uniform(-0.15, 0.15)
    tx = uniform(-2.0, 2.0) / 14.0  # +-2 px in normalized [-1, 1] coordinates
    ty = uniform(-2.0, 2.0) / 14.0
    cos, sin = torch.cos(angle), torch.sin(angle)
    # Output -> input sampling matrix: rotation * shear, divided by scale.
    a = cos / scale
    b = (cos * shear - sin) / scale
    c = sin / scale
    d = (sin * shear + cos) / scale
    theta = torch.stack([torch.stack([a, b, tx], 1), torch.stack([c, d, ty], 1)], 1)
    grid = F.affine_grid(theta, list(x.shape), align_corners=False)
    x = F.grid_sample(x, grid, mode="bilinear", padding_mode="zeros", align_corners=False)

    # Stroke-thickness jitter: 3x3 max-pool thickens, 3x3 min-pool thins.
    # A full erosion wipes out thin MNIST strokes, so thinning is blended half and half.
    r = torch.rand(n, generator=g).view(n, 1, 1, 1)
    dilated = F.max_pool2d(x, 3, stride=1, padding=1)
    eroded = 0.5 * (x - F.max_pool2d(-x, 3, stride=1, padding=1))
    x = torch.where(r < 0.3, dilated, torch.where(r > 0.85, eroded, x))
    return x.clamp(0.0, 1.0)


def make_model() -> nn.Sequential:
    return nn.Sequential(
        nn.Flatten(),
        nn.Linear(784, 64), nn.ReLU(),
        nn.Linear(64, 32), nn.ReLU(),
        nn.Linear(32, 10),
    )


def b64(arr: np.ndarray) -> str:
    return base64.b64encode(arr.tobytes()).decode("ascii")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--epochs", type=int, default=15)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--lr", type=float, default=2e-3)
    ap.add_argument("--weight-decay", type=float, default=1e-4)
    ap.add_argument("--batch", type=int, default=128)
    args = ap.parse_args()

    torch.manual_seed(args.seed)
    np.random.seed(args.seed)
    g = torch.Generator().manual_seed(args.seed)

    xtr, ytr = load(True)
    xte, yte = load(False)
    model = make_model()
    opt = torch.optim.Adam(model.parameters(), lr=args.lr, weight_decay=args.weight_decay)
    steps = args.epochs * math.ceil(len(xtr) / args.batch)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=args.lr, total_steps=steps, pct_start=0.15)

    def accuracy() -> float:
        model.eval()
        with torch.no_grad():
            return (model(xte).argmax(1) == yte).float().mean().item()

    for epoch in range(args.epochs):
        model.train()
        perm = torch.randperm(len(xtr), generator=g)
        total = 0.0
        for i in range(0, len(xtr), args.batch):
            idx = perm[i:i + args.batch]
            loss = F.cross_entropy(model(augment(xtr[idx], g)), ytr[idx])
            opt.zero_grad()
            loss.backward()
            opt.step()
            sched.step()
            total += loss.item() * len(idx)
        print(f"epoch {epoch + 1:2d}/{args.epochs}  loss {total / len(xtr):.4f}  test accuracy {accuracy():.4f}")

    acc = accuracy()
    print(f"\nFinal MNIST test accuracy: {acc * 100:.2f}%  (target >= 97%)")

    model.eval()
    linears = [m for m in model if isinstance(m, nn.Linear)]
    names = ["hidden1", "hidden2", "output"]
    acts = ["relu", "relu", "softmax"]
    layers = []
    for lin, name, act in zip(linears, names, acts):
        w = lin.weight.detach().numpy().astype("<f4")  # [units, inputs], row-major
        b = lin.bias.detach().numpy().astype("<f4")
        layers.append({"name": name, "units": int(w.shape[0]), "activation": act, "W": b64(w), "b": b64(b)})

    (ROOT / "src" / "model").mkdir(parents=True, exist_ok=True)
    (ROOT / "tests" / "fixtures").mkdir(parents=True, exist_ok=True)

    weights = {
        "format": "mnist-mlp/v1",
        "input": {"shape": [28, 28], "range": [0, 1], "ink": "high"},
        "layers": layers,
        "metrics": {"test_accuracy": round(acc, 4)},
        "source": "training/train.py",
        "created": datetime.date.today().isoformat(),
    }
    (ROOT / "src" / "model" / "mnist-mlp.json").write_text(json.dumps(weights, indent=1) + "\n")

    with torch.no_grad():
        probs = F.softmax(model(xte), dim=1)
    raw = datasets.MNIST(str(DATA), train=False).data.numpy().astype(np.uint8)  # [N, 28, 28]

    # Samples: per class, the first 3 test digits the model reads correctly and confidently.
    samples = []
    for digit in range(10):
        picked = 0
        for i in range(len(yte)):
            if yte[i].item() == digit and probs[i, digit].item() > 0.95:
                samples.append({"label": digit, "pixels": b64(raw[i])})
                picked += 1
                if picked == 3:
                    break
    (ROOT / "src" / "model" / "samples.json").write_text(
        json.dumps({"format": "mnist-samples/v1", "encoding": "uint8 28x28 row-major, base64", "samples": samples}, indent=1) + "\n")

    n = 200
    parity = {
        "format": "mnist-parity/v1",
        "count": n,
        "images": b64(raw[:n]),  # uint8, n * 784 bytes; model input is value / 255
        "labels": [int(v) for v in yte[:n]],
        "probs": [[round(float(p), 7) for p in row] for row in probs[:n]],
    }
    (ROOT / "tests" / "fixtures" / "parity.json").write_text(json.dumps(parity) + "\n")
    print("Wrote src/model/mnist-mlp.json, src/model/samples.json, tests/fixtures/parity.json")


if __name__ == "__main__":
    main()
