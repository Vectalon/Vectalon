# Design and UX specification

## Design specification

### Screen structure
- Header: title or primary action
- Body: feature-specific content
- Footer: secondary actions

### Interaction notes
- Provide clear loading and error states.
- Use consistent spacing and typography with existing screens.

## Motion design recommendations

| Element | Intent | Primary | Duration | Easing | Notes |
|---|---|---|---|---|---|
| Cards / Screens / Modals | Create spatial awareness during context switches | position | 250ms | cubic-bezier(0.4, 0, 0.2, 1) | Enter from 20px below with opacity 0. Exit with ease-in acceleration. Keep motion under 1/3 of screen. |
| Loading / Skeleton | Indicate progress without blocking perceived responsiveness | opacity | 800ms | ease-in-out | Skeleton pulse: opacity 0.4 -> 1.0 in 800ms loops. Spinner: continuous rotation with linear easing. |
| Error / Alert | Signal a problem clearly and firmly | position | 350ms | cubic-bezier(0.4, 0, 0.2, 1) | Horizontal shake 2-3 oscillations (±10px). Red tint applied simultaneously. No overshoot. |

```
+------------------+
| Feature Screen   |
|                  |
|  [Content]       |
|                  |
|  [Actions]       |
|                  |
+------------------+
```

Use StyleSheet.create for all styles to match project convention.