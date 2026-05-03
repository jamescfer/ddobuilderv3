// DDOTheme.h
// Centralized DDO / D&D themed color palette for the application UI.
// All custom drawing code should use these constants for consistency.
#pragma once

// ---------------------------------------------------------------------------
// Background layers  (dark stone / dungeon aesthetic)
// ---------------------------------------------------------------------------
#define CLR_DDO_BG_DARKEST  RGB(10,   5,   5)   // deepest shadow / main client
#define CLR_DDO_BG_DARK     RGB(22,  13,  13)   // dark stone wall (warm red-black)
#define CLR_DDO_BG_MID      RGB(36,  20,  20)   // medium panel background
#define CLR_DDO_BG_PANEL    RGB(30,  17,  17)   // pane / dialog client area
#define CLR_DDO_BG_LIGHT    RGB(52,  32,  32)   // lighter element / hover base

// ---------------------------------------------------------------------------
// Gold / amber  (magical light, D&D treasure)
// ---------------------------------------------------------------------------
#define CLR_DDO_GOLD        RGB(201, 168,  76)  // classic D&D gold
#define CLR_DDO_GOLD_BRIGHT RGB(235, 205, 110)  // bright highlight / active tab text
#define CLR_DDO_GOLD_DARK   RGB(138,  98,  28)  // pressed / inactive gold
#define CLR_DDO_GOLD_DIM    RGB(105,  75,  20)  // very subdued gold accent

// ---------------------------------------------------------------------------
// Dark red / crimson  (D&D danger, blood, infernal accents)
// ---------------------------------------------------------------------------
#define CLR_DDO_RED         RGB(160,  28,  28)  // mid crimson – active element
#define CLR_DDO_RED_DARK    RGB( 90,  12,  12)  // deep blood red – borders, frames
#define CLR_DDO_RED_DIM     RGB( 60,   8,   8)  // very dark red – subtle dividers
#define CLR_DDO_RED_BRIGHT  RGB(200,  50,  50)  // vivid crimson – hover accent

// ---------------------------------------------------------------------------
// Orange glow  (active pane / selected state)
// ---------------------------------------------------------------------------
#define CLR_DDO_ORANGE      RGB(210, 110,  20)  // active pane glow / toggle-on
#define CLR_DDO_ORANGE_DIM  RGB(140,  70,  12)  // softer glow variant

// ---------------------------------------------------------------------------
// Text  (parchment / ink tones)
// ---------------------------------------------------------------------------
#define CLR_DDO_TEXT        RGB(228, 210, 158)  // primary parchment cream
#define CLR_DDO_TEXT_DIM    RGB(168, 142,  92)  // secondary / inactive text
#define CLR_DDO_TEXT_OFF    RGB(120,  96,  55)  // very dim, deemphasized text
#define CLR_DDO_TEXT_DEAD   RGB( 88,  68,  38)  // disabled text

// ---------------------------------------------------------------------------
// UI structure
// ---------------------------------------------------------------------------
#define CLR_DDO_BORDER      RGB( 88,  38,  38)  // element border / separator
#define CLR_DDO_BORDER_LT   RGB(128,  60,  60)  // lighter border / highlight edge
#define CLR_DDO_SELECT      RGB( 90,  22,  22)  // selection background
#define CLR_DDO_HOVER       RGB(110,  35,  35)  // hover / rollover background
#define CLR_DDO_PRESSED     RGB( 60,  12,  12)  // pressed / depressed background

// ---------------------------------------------------------------------------
// Pane caption bars  (dark red gradient)
// ---------------------------------------------------------------------------
#define CLR_DDO_CAP_TOP     RGB(45,  12,  12)   // caption gradient top (dark crimson)
#define CLR_DDO_CAP_BTM     RGB(95,  32,  32)   // caption gradient bottom (mid crimson)

// ---------------------------------------------------------------------------
// Active pane caption  (orange glow)
// ---------------------------------------------------------------------------
#define CLR_DDO_CAP_ACTIVE_TOP  RGB(60,  22,   5)   // active gradient top
#define CLR_DDO_CAP_ACTIVE_BTM  RGB(135, 62,  10)   // active gradient bottom (warm orange)

// ---------------------------------------------------------------------------
// Tooltip
// ---------------------------------------------------------------------------
#define CLR_DDO_TIP_BG      RGB(28,  14,  14)
#define CLR_DDO_TIP_TEXT    RGB(228, 210, 158)
#define CLR_DDO_TIP_BORDER  RGB(128,  60,  36)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
inline bool DDOThemeIsActive()
{
    COLORREF clrFace = ::GetSysColor(COLOR_BTNFACE);
    return (GetRValue(clrFace) < 80);
}
