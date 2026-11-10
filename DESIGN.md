# Domel Market Intelligence Design System

## Visual direction

A light-first research workspace for long reading, evidence checking, and fast approval. Use a quiet application frame, generous white surfaces, restrained borders, and one clear action color. The Agent review stream is the only place with a violet emphasis.

## Tokens

- Canvas: `#F4F7F8`; raised canvas: `#FFFFFF`; soft surface: `#F8FBFB`.
- Ink: `#152D39`; body: `#61757E`; muted: `#637580`; hairline: `rgba(18, 47, 59, .13)`.
- Primary action: `#168F82`; primary soft: `#E7F6F2`; Agent accent: `#6654BD`; Agent soft: `#F4F1FF`.
- Semantic success: `#168F82`; warning: `#A86F1B`; error: `#C24B57`.
- Use accent colors by role. Avoid gradients behind text and avoid a different color for every card.

## Typography

Use Manrope for interface text and DM Mono for technical labels, Evidence IDs, and timestamps. Keep headings compact with negative tracking. Body text should stay between 12–16px and use a 1.5 line-height for evidence reading.

## Layout

- 8px spacing base; common gaps are 8, 12, 16, 24, and 32px.
- Desktop uses a quiet 240px sidebar and a sticky 84px header.
- Main work areas use split layouts: content first, context second.
- Cards use 12–16px radius, white surfaces, and hairline borders. Shadows are soft and low contrast.
- On narrow screens, collapse the sidebar and stack context panels below the primary flow.

## Interaction rules

- Primary button: solid teal with a small upward arrow for start/submit actions.
- Secondary button: white or soft-green fill with a hairline border.
- Status pills use semantic color and short Chinese labels.
- Agent review actions sit beside each insight: `接受并用于报告` and `拒绝`.
- Never show a secret after it is saved. Settings displays only configured/not configured state.
- Evidence IDs are always visible near the conclusion they support.
