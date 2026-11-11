# Training (optional, dev-only)

The app ships with trained weights in `src/model/mnist-mlp.json`. You only need this folder to retrain.

```
python -m venv training/.venv
training/.venv/bin/pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
training/.venv/bin/python training/train.py
```

(On Windows the paths are `training\.venv\Scripts\pip` and `training\.venv\Scripts\python`.)

The script downloads MNIST into `training/data/` (git-ignored, about 12 MB, internet needed once), trains a
784 → 64 → 32 → 10 network for about a minute on a laptop CPU, prints the test accuracy and rewrites:

| File | Contents |
|---|---|
| `src/model/mnist-mlp.json` | the weights (format in `AGENTS.md` §5.3) |
| `src/model/samples.json` | 3 test digits per class, used by attract mode and the debug overlay |
| `tests/fixtures/parity.json` | 200 test digits with PyTorch's output probabilities, used by `npm test` |

Afterwards run `npm test` and `npm run release`, and commit the three files plus `release/mnist-booth.html`.

Options: `--epochs 15 --seed 0 --lr 0.002 --weight-decay 0.0001`.
