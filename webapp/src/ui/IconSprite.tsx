import React from "react";
import { iconStyleFromSprite } from "./iconSprite";
import type { Icon } from "@/data/components";

export default function IconSprite({ icon, scale = 1 }: { icon: Icon; scale?: number }) {
  return <span aria-hidden="true" style={iconStyleFromSprite(icon, scale)} />;
}
