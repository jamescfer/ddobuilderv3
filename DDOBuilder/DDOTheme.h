// DDOTheme.h
// Centralized DDO / D&D themed color palette for the application UI.
// All custom drawing code should use these constants for consistency.
#pragma once

// ---------------------------------------------------------------------------
// Background layers  (dark stone / dungeon aesthetic)
// ---------------------------------------------------------------------------
#define CLR_DDO_BG_DARKEST  RGB(12,  8,  3)    // deepest shadow / main client
#define CLR_DDO_BG_DARK     RGB(25, 18,  7)    // dark stone wall
#define CLR_DDO_BG_MID      RGB(38, 27, 11)    // medium panel background
#define CLR_DDO_BG_PANEL    RGB(32, 23,  9)    // pane / dialog client area
#define CLR_DDO_BG_LIGHT    RGB(54, 40, 17)    // lighter element / hover base

// ---------------------------------------------------------------------------
// Gold / amber  (magical light, D&D treasure color)
// ---------------------------------------------------------------------------
#define CLR_DDO_GOLD        RGB(201, 168,  76)  // classic D&D gold
#define CLR_DDO_GOLD_BRIGHT RGB(235, 205, 110)  // bright highlight / active tab
#define CLR_DDO_GOLD_DARK   RGB(138,  98,  28)  // pressed / inactive gold
#define CLR_DDO_GOLD_DIM    RGB(105,  75,  20)  // very subdued gold accent

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
#define CLR_DDO_BORDER      RGB( 88,  63,  22)  // element border / separator
#define CLR_DDO_BORDER_LT   RGB(128,  96,  36)  // lighter border / highlight edge
#define CLR_DDO_SELECT      RGB( 78,  56,  17)  // selection background
#define CLR_DDO_HOVER       RGB( 98,  73,  24)  // hover / rollover background
#define CLR_DDO_PRESSED     RGB( 58,  42,  12)  // pressed / depressed background

// ---------------------------------------------------------------------------
// Pane caption bars
// ---------------------------------------------------------------------------
#define CLR_DDO_CAP_TOP     RGB(18,  13,   5)   // caption gradient top (darker)
#define CLR_DDO_CAP_BTM     RGB(44,  32,  12)   // caption gradient bottom (lighter)

// ---------------------------------------------------------------------------
// Tooltip
// ---------------------------------------------------------------------------
#define CLR_DDO_TIP_BG      RGB(32, 24,  10)
#define CLR_DDO_TIP_TEXT    RGB(228, 210, 158)
#define CLR_DDO_TIP_BORDER  RGB(128,  96,  36)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
// Returns true when the current system button-face colour indicates that
// the DDO dark visual manager is active (system colour is near our BG_DARK).
inline bool DDOThemeIsActive()
{
    COLORREF clrFace = ::GetSysColor(COLOR_BTNFACE);
    return (GetRValue(clrFace) < 80);
}
