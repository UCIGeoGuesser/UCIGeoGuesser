import type { CSSProperties } from "react";

/* Slot over the mini-map shared by the Guess and Next Image buttons, so the
   Next button lands exactly where the player just clicked Guess. */
export const MAP_BUTTON_SLOT: CSSProperties = {
  position: "absolute",
  bottom: "10%",
  left: "47%",
  transform: "translateX(-25%)",
  fontSize: 22,
  zIndex: 400,
};
