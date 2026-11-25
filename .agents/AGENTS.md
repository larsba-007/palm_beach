# Project Custom Rules for Palm Beach (inherited from Boca Raton)

## UI Layout & Scaling Constraint
Always position all panels, buttons, grids, text boxes, and card views inside game screens (`panel-1-hub`, `panel-2-setup`, `panel-3-gambits-v2`) using **absolute coordinates** relative to the fixed 4K virtual canvas (`3840px` by `2160px`) or relative to the glass backplate wrapper boundaries.

### Rationale:
The codebase utilizes a continuous viewport scaling wrapper that transforms the entire screen via a CSS scale factor. Absolute coordinate systems prevent elements from reflowing, breaking margins, wrapping text lines, or offsetting card heights when browser windows shrink or resize.
