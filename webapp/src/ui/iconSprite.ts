import type React from "react";
import type { Icon } from "@/data/components";

export function iconStyleFromSprite(icon: Icon, scale = 1): React.CSSProperties {
  const sheetPath = icon.files.orig;
  const { x, y, width, height } = icon.sprite;

  return {
    display: "inline-block",
    width: `${width * scale}px`,
    height: `${height * scale}px`,
    backgroundImage: `url(${sheetPath})`,
    backgroundRepeat: "no-repeat",
    backgroundPosition: `-${x * scale}px -${y * scale}px`,
    backgroundSize: `${icon.width * scale}px ${icon.height * scale}px`,
    imageRendering: "crisp-edges",
  };
}
