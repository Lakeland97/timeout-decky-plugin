/**
 * Centralized z-index orchestration for Timeout overlays.
 *
 * Layering rules (from bottom to top):
 *  - Game / app window:        rendered by gamescope (no CSS z-index)
 *  - Steam UI base:            Steam-managed
 *  - Game overlay (alerts bar) rendered above the game window.
 *  - Modal portals (focus, sleep blocker, etc.).
 *
 * Z-index values stay within the safe 32-bit signed integer space
 * Steam UI tolerates without breaking native popovers.
 */
export const Z_INDEX = {
    /** Default alerts overlay layer. */
    GAME_OVERLAY_BASE: 2147483645,
    /** Modal portals (focus, sleep blocker, etc.). */
    MODAL_PORTAL: 2147483647,
} as const;

/**
 * CSS injected once at plugin startup so that Steam / Decky modal portals always
 * sit above our game overlay. This addresses cases where the modal is rendered
 * into a portal container with a default z-index lower than ours.
 *
 * The selectors cover the common modal containers used by @decky/ui and Steam UI.
 * Using attribute and class hooks instead of broad `*` rules avoids interfering
 * with native popovers (focus rings, tooltips) elsewhere in the Steam UI.
 */
export const MODAL_ZINDEX_CSS = `
.ModalPosition,
.ModalPosition_BottomSheet,
.DialogOverlay,
.ModalOverlayContent,
.ReactModal__Overlay,
.ReactModalPortal,
.ReactModalPortal > div {
    z-index: ${Z_INDEX.MODAL_PORTAL} !important;
}
`;
