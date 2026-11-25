# Boca Raton Design Recipe & Scaling Architecture

This document defines the layout, typography, and styling recipe for the Boca Raton board game, with a focus on the continuous scaling system and layout principles.

---

## 1. The Scaling Architecture: Why Absolute Positioning is Required

Boca Raton uses a **4K Virtual Canvas Scaling System** to achieve responsive UI scaling without rendering jumps, text wrapping changes, or layout shift artifacts.

### The Virtual Canvas Concept
- The game's root rendering target is a fixed-resolution frame: **3840px width by 2160px height**.
- At runtime, the `configureGameWindow()` auto-zoom logic calculates the ratio between the user's actual browser viewport and this 3840x2160 bounding box.
- It then scales the entire layout container (`#game-scale-wrapper`) uniformly using the CSS `transform: scale(zoomFactor)` property.

### Why All Elements MUST Use Absolute Positioning
To guarantee that the game preserves its high-fidelity layout on all devices (mobile, tablet, laptop, desktop):

1. **Pixel-Perfect Spacing & Proportions**: Absolute positioning ensures that all UI elements retain their exact relative distances, alignments, and sizes. Using standard responsive flex grids or relative layouts causes browsers to recalculate dimensions and wrap text, breaking card boundaries.
2. **Reflow & Wrap Prevention**: Because elements scale uniformly via CSS transform, standard layout reflow is unnecessary. Absolute coordinates prevent elements from jumping below other elements when screen dimensions shrink.
3. **Coordinated Hover Transitions**: Scaling triggers (like zooming a player/opponent card on hover) must compute bounds deterministically. Absolute positioning guarantees coordinate systems match the scale wrapper exactly.

> [!IMPORTANT]
> **Layout Rule**: Always position panels, columns, cards, and primary buttons using `absolute` with fixed pixel offsets (e.g., `top-[250px] left-[500px] w-[2840px] h-[1660px]`) inside the `3840x2160` virtual stage.

---

## 2. V2 Glass Plate Panels

Standardized container styles for plates and modal containers:

```html
<!-- Single Uniform Glass Plate Container -->
<div class="v2-panel absolute top-[250px] left-1/2 -translate-x-1/2 w-[2840px] h-[1660px] overflow-visible">
    <!-- Contents positioned absolutely inside -->
</div>
```

### CSS Tokens (defined in `index.css` via `.v2-panel`):
* **Background Plate**: `bg-[#26385C]/50` (Navy blue at exactly 50% opacity).
* **Blur Effect**: `backdrop-blur-md` (Provides the frosted glass effect).
* **Border Edge**: `border border-white/10` (Subtle 1px border at 10% opacity).
* **Corners & Depth**: `rounded-3xl` for modern curves, `shadow-2xl` for depth.

---

## 3. Typography & Typography Sizing

Always use the **Overpass** Google Font (`font-overpass`) for game texts.

### Sizing and Weight Rules:
1. **Primary Headers / Breadcrumbs**: 
   * **Classes**: `text-[60px] font-black uppercase tracking-widest drop-shadow-md`
   * **Weight**: 900 (`font-black`)
2. **Section Titles (inside plates)**:
   * **Classes**: `text-[40px] font-black uppercase tracking-widest text-white`
3. **Sub-headers / Dynamic values**:
   * **Classes**: `text-[32px] font-light text-white uppercase`
   * **Weight**: 200/300 (`font-light` / `font-normal`)
4. **Body Text**:
   * **Classes**: `text-[30px] font-light text-white/80`

---

## 4. Playing Cards Sizing & Interaction

Card elements (local and bot profiles) must line up and scale predictably.

- **Sizing**: `w-[400px] h-[686px]` (Maintains the golden ratio).
- **Alignment**: Align columns using `items-start` rather than `items-end` to align card boundaries at the top and bottom, preventing bottom text boxes from offsetting cards.
- **Hover Scale**: Use `hover:scale-[1.75] hover:z-[200] z-[10] transition-transform transition-shadow duration-300 ease-out` without defining `origin-bottom`. This forces cards to zoom symmetrically from the center.
