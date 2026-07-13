// 自製 slide runtime:全螢幕、方向鍵/空白鍵翻頁、Esc 退出、
// ?p=N 深連結、speaker notes 面板(s 鍵)。不用 reveal.js。

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SlideDoc } from "../ir/types";
import type { TemplateConfig } from "../templates";
import { ScaledSlide } from "./SlideView";

function readDeepLink(): number {
  const p = new URLSearchParams(window.location.search).get("p");
  const n = p ? parseInt(p, 10) : NaN;
  return Number.isFinite(n) && n >= 1 ? n - 1 : 0;
}

function writeDeepLink(idx: number) {
  const url = new URL(window.location.href);
  url.searchParams.set("p", String(idx + 1));
  window.history.replaceState(null, "", url.toString());
}

function clearDeepLink() {
  const url = new URL(window.location.href);
  url.searchParams.delete("p");
  window.history.replaceState(null, "", url.toString());
}

export function SlideMode({
  doc,
  template,
  onExit,
}: {
  doc: SlideDoc;
  template: TemplateConfig;
  onExit: () => void;
}) {
  // skip 頁不進 slide mode(PROFILE §6)
  const slides = useMemo(() => doc.slides.filter((s) => !s.skip), [doc]);
  const [idx, setIdx] = useState(() => Math.min(readDeepLink(), Math.max(0, slides.length - 1)));
  const [showNotes, setShowNotes] = useState(false);

  const go = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(slides.length - 1, next));
      setIdx(clamped);
      writeDeepLink(clamped);
    },
    [slides.length]
  );

  useEffect(() => {
    writeDeepLink(idx);
    // 進場嘗試全螢幕;失敗(未經手勢等)則維持視窗內全版
    document.documentElement.requestFullscreen?.().catch(() => {});
    return () => {
      clearDeepLink();
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowRight":
        case "ArrowDown":
        case " ":
        case "PageDown":
        case "Enter":
          e.preventDefault();
          go(idx + 1);
          break;
        case "ArrowLeft":
        case "ArrowUp":
        case "PageUp":
        case "Backspace":
          e.preventDefault();
          go(idx - 1);
          break;
        case "Home":
          go(0);
          break;
        case "End":
          go(slides.length - 1);
          break;
        case "s":
        case "S":
          setShowNotes((v) => !v);
          break;
        case "Escape":
          onExit();
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [idx, go, onExit, slides.length]);

  if (!slides.length) {
    return (
      <div className="sd-present-empty" onClick={onExit}>
        沒有可簡報的頁面(全部被 skip?)
      </div>
    );
  }

  const slide = slides[idx];

  return (
    <div className="sd-present">
      <div
        className="sd-present-stage"
        onClick={(e) => {
          // 點右半前進、左半後退
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          go(e.clientX - rect.left > rect.width / 2 ? idx + 1 : idx - 1);
        }}
      >
        <ScaledSlide slide={slide} template={template} pageNo={idx + 1} total={slides.length} />
      </div>
      {showNotes ? (
        <div className="sd-notes-panel">
          <div className="sd-notes-title">Speaker Notes — 第 {idx + 1} 頁</div>
          <div className="sd-notes-body">{slide.notes || "(本頁無備註)"}</div>
        </div>
      ) : null}
      <div className="sd-present-hint">←/→ 翻頁 · s 備註 · Esc 離開</div>
    </div>
  );
}
