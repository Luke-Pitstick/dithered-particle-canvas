import type { DitheredLayer } from "../../types";
import { DEFAULT_REVEAL, type LayerRole, type NormalizedLayer, type NormalizedLayerSource } from "../renderer/types";

export function normalizeLayer(
  role: LayerRole,
  layer: DitheredLayer,
  source: NormalizedLayerSource
): NormalizedLayer {
  const reveal =
    layer.reveal === true
      ? DEFAULT_REVEAL
      : layer.reveal
        ? { ...DEFAULT_REVEAL, ...layer.reveal }
        : false;

  return {
    dither: layer.dither ?? { amount: 1, matrixSize: 4, palette: "browserbase" },
    filters: layer.filters ?? [],
    fit: layer.fit ?? "cover",
    opacity: layer.opacity ?? 1,
    position: layer.position ?? "center",
    reveal,
    role,
    source,
    visible: layer.visible ?? true
  };
}
