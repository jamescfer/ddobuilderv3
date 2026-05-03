// CDDOVisualManager.cpp
// Ground-up MFC visual manager for DDOBuilder.
// Modern flat dark rendering using the DDOTheme palette – no Office chrome.

#include "stdafx.h"
#include "CDDOVisualManager.h"

IMPLEMENT_DYNCREATE(CDDOVisualManager, CMFCVisualManager)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

namespace
{
    // Encode a COLORREF component into the 16-bit TRIVERTEX field.
    inline COLOR16 CC(BYTE c) { return static_cast<COLOR16>(c) << 8; }

    // Fill a rect with a vertical gradient (top→bottom).
    void GradV(CDC* pDC, CRect r, COLORREF clrTop, COLORREF clrBtm)
    {
        TRIVERTEX tv[2] = {};
        tv[0].x = r.left;  tv[0].y = r.top;
        tv[0].Red   = CC(GetRValue(clrTop));
        tv[0].Green = CC(GetGValue(clrTop));
        tv[0].Blue  = CC(GetBValue(clrTop));
        tv[1].x = r.right; tv[1].y = r.bottom;
        tv[1].Red   = CC(GetRValue(clrBtm));
        tv[1].Green = CC(GetGValue(clrBtm));
        tv[1].Blue  = CC(GetBValue(clrBtm));
        GRADIENT_RECT gr = { 0, 1 };
        ::GradientFill(pDC->GetSafeHdc(), tv, 2, &gr, 1, GRADIENT_FILL_RECT_V);
    }
}

// ---------------------------------------------------------------------------
// Construction / destruction
// ---------------------------------------------------------------------------

CDDOVisualManager::CDDOVisualManager()
{
    RebuildBrushes();
}

CDDOVisualManager::~CDDOVisualManager()
{
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

void CDDOVisualManager::RebuildBrushes()
{
    auto Rebuild = [](CBrush& br, COLORREF clr)
    {
        br.DeleteObject();
        br.CreateSolidBrush(clr);
    };

    Rebuild(m_brDarkest, CLR_DDO_BG_DARKEST);
    Rebuild(m_brDark,    CLR_DDO_BG_DARK);
    Rebuild(m_brMid,     CLR_DDO_BG_MID);
    Rebuild(m_brPanel,   CLR_DDO_BG_PANEL);
    Rebuild(m_brHover,   CLR_DDO_HOVER);
    Rebuild(m_brSelect,  CLR_DDO_SELECT);
    Rebuild(m_brPressed, CLR_DDO_PRESSED);
}

/*static*/ void CDDOVisualManager::DrawDropArrow(CDC* pDC, CRect rect, COLORREF clr)
{
    const int cx = rect.CenterPoint().x;
    const int cy = rect.CenterPoint().y;

    CPen pen(PS_SOLID, 1, clr);
    CBrush br(clr);
    CPen*   pOldPen = pDC->SelectObject(&pen);
    CBrush* pOldBr  = pDC->SelectObject(&br);

    POINT pts[3] = {
        { cx - 4, cy - 2 },
        { cx + 4, cy - 2 },
        { cx,     cy + 3 }
    };
    pDC->Polygon(pts, 3);

    pDC->SelectObject(pOldBr);
    pDC->SelectObject(pOldPen);
}

/*static*/ void CDDOVisualManager::DrawCheckGlyph(CDC* pDC, CRect rect, COLORREF clr)
{
    CPen pen(PS_SOLID, 2, clr);
    CPen* pOld = pDC->SelectObject(&pen);

    const int cx = rect.CenterPoint().x;
    const int cy = rect.CenterPoint().y;

    pDC->MoveTo(cx - 4, cy);
    pDC->LineTo(cx - 1, cy + 3);
    pDC->LineTo(cx + 4, cy - 3);

    pDC->SelectObject(pOld);
}

/*static*/ void CDDOVisualManager::DrawRadioBullet(CDC* pDC, CRect rect, COLORREF clr)
{
    CBrush br(clr);
    CPen pen(PS_SOLID, 1, clr);
    CBrush* pOldBr  = pDC->SelectObject(&br);
    CPen*   pOldPen = pDC->SelectObject(&pen);

    CRect rc = rect;
    rc.DeflateRect(rc.Width() / 3, rc.Height() / 3);
    pDC->Ellipse(rc);

    pDC->SelectObject(pOldBr);
    pDC->SelectObject(pOldPen);
}

// ---------------------------------------------------------------------------
// OnUpdateSystemColors – rebuild brushes when Windows color scheme changes
// ---------------------------------------------------------------------------

void CDDOVisualManager::OnUpdateSystemColors()
{
    CMFCVisualManager::OnUpdateSystemColors();
    RebuildBrushes();
}

// ===========================================================================
// BAR BACKGROUNDS
// ===========================================================================

// OnFillBarBackground -------------------------------------------------------
// Fills toolbars, menu bars, and dockable pane client areas.
//   bNCArea=TRUE  → non-client strip (gripper / outer border band)
//   bNCArea=FALSE → client / content area
void CDDOVisualManager::OnFillBarBackground(
    CDC* pDC, CBasePane* pBar,
    CRect rectClient, CRect rectClip, BOOL bNCArea)
{
    ASSERT_VALID(pDC);
    ASSERT_VALID(pBar);

    CRect rcFill = rectClip.IsRectEmpty() ? rectClient : rectClip;

    if (bNCArea)
    {
        GradV(pDC, rcFill, CLR_DDO_CAP_TOP, CLR_DDO_CAP_BTM);
    }
    else
    {
        pDC->FillSolidRect(rcFill, CLR_DDO_BG_DARK);
    }
}

// OnDrawSeparator -----------------------------------------------------------
// Thin 1px line separating toolbar groups.
void CDDOVisualManager::OnDrawSeparator(CDC* pDC, CBasePane* /*pBar*/, CRect rect, BOOL bHorz)
{
    ASSERT_VALID(pDC);
    CPen pen(PS_SOLID, 1, CLR_DDO_RED_DARK);
    CPen* pOld = pDC->SelectObject(&pen);

    if (bHorz)
    {
        const int mid = (rect.top + rect.bottom) / 2;
        pDC->MoveTo(rect.left,  mid);
        pDC->LineTo(rect.right, mid);
    }
    else
    {
        const int mid = (rect.left + rect.right) / 2;
        pDC->MoveTo(mid, rect.top);
        pDC->LineTo(mid, rect.bottom);
    }

    pDC->SelectObject(pOld);
}

// ===========================================================================
// TOOLBAR BUTTONS
// ===========================================================================

// OnFillButtonInterior ------------------------------------------------------
void CDDOVisualManager::OnFillButtonInterior(
    CDC* pDC, CMFCToolBarButton* /*pButton*/,
    CRect rect, AFX_BUTTON_STATE state)
{
    ASSERT_VALID(pDC);
    switch (state)
    {
    case ButtonsIsHighlighted:
        pDC->FillSolidRect(rect, CLR_DDO_HOVER);
        break;
    case ButtonsIsPressed:
        pDC->FillSolidRect(rect, CLR_DDO_PRESSED);
        break;
    default:
        break;
    }
}

// OnDrawButtonBorder --------------------------------------------------------
void CDDOVisualManager::OnDrawButtonBorder(
    CDC* pDC, CMFCToolBarButton* /*pButton*/,
    CRect rect, AFX_BUTTON_STATE state)
{
    ASSERT_VALID(pDC);
    if (state == ButtonsIsRegular)
        return;

    COLORREF clr = (state == ButtonsIsPressed) ? CLR_DDO_GOLD : CLR_DDO_GOLD_DARK;
    CPen pen(PS_SOLID, 1, clr);
    CPen* pOld = pDC->SelectObject(&pen);
    pDC->SelectStockObject(NULL_BRUSH);
    pDC->Rectangle(rect);
    pDC->SelectObject(pOld);
}

// ===========================================================================
// MENU
// ===========================================================================

// GetMenuItemTextColor -------------------------------------------------------
COLORREF CDDOVisualManager::GetMenuItemTextColor(
    CMFCToolBarMenuButton* /*pButton*/,
    BOOL bHighlighted, BOOL bDisabled)
{
    if (bDisabled)    return CLR_DDO_TEXT_DEAD;
    if (bHighlighted) return CLR_DDO_GOLD_BRIGHT;
    return CLR_DDO_TEXT;
}

// OnHighlightMenuItem -------------------------------------------------------
void CDDOVisualManager::OnHighlightMenuItem(
    CDC* pDC, CMFCToolBarMenuButton* /*pButton*/,
    CRect rect, COLORREF& clrText)
{
    ASSERT_VALID(pDC);
    pDC->FillSolidRect(rect, CLR_DDO_HOVER);

    CRect rcAccent(rect.left, rect.top, rect.left + 3, rect.bottom);
    pDC->FillSolidRect(rcAccent, CLR_DDO_GOLD_DARK);

    clrText = CLR_DDO_GOLD_BRIGHT;
}

// OnHighlightRarelyUsedMenuItems --------------------------------------------
void CDDOVisualManager::OnHighlightRarelyUsedMenuItems(CDC* pDC, CRect rectRarelyUsed)
{
    ASSERT_VALID(pDC);
    pDC->FillSolidRect(rectRarelyUsed, CLR_DDO_BG_DARKEST);
}

// OnDrawMenuBorder ----------------------------------------------------------
void CDDOVisualManager::OnDrawMenuBorder(
    CDC* pDC, CMFCPopupMenu* /*pMenu*/, CRect rect)
{
    ASSERT_VALID(pDC);

    // Outer border
    CPen penOuter(PS_SOLID, 1, CLR_DDO_BORDER_LT);
    CPen* pOld = pDC->SelectObject(&penOuter);
    pDC->SelectStockObject(NULL_BRUSH);
    pDC->Rectangle(rect);

    // Inner shadow line for depth
    rect.DeflateRect(1, 1);
    CPen penInner(PS_SOLID, 1, CLR_DDO_BORDER);
    pDC->SelectObject(&penInner);
    pDC->Rectangle(rect);

    pDC->SelectObject(pOld);
}

// OnFillMenuImageRect -------------------------------------------------------
void CDDOVisualManager::OnFillMenuImageRect(
    CDC* pDC, CMFCToolBarButton* /*pButton*/,
    CRect rect, AFX_BUTTON_STATE /*state*/)
{
    ASSERT_VALID(pDC);
    pDC->FillSolidRect(rect, CLR_DDO_BG_DARK);
}

// OnDrawMenuCheck -----------------------------------------------------------
void CDDOVisualManager::OnDrawMenuCheck(
    CDC* pDC, CMFCToolBarMenuButton* /*pButton*/,
    CRect rect, BOOL bHighlight, BOOL bIsRadio)
{
    ASSERT_VALID(pDC);
    COLORREF clr = bHighlight ? CLR_DDO_GOLD_BRIGHT : CLR_DDO_GOLD;

    if (bIsRadio)
        DrawRadioBullet(pDC, rect, clr);
    else
        DrawCheckGlyph(pDC, rect, clr);
}

// ===========================================================================
// POPUP / PANE BACKGROUND
// ===========================================================================

void CDDOVisualManager::OnFillPopupWindowBackground(CDC* pDC, CRect rect)
{
    ASSERT_VALID(pDC);
    pDC->FillSolidRect(rect, CLR_DDO_BG_MID);
}

// ===========================================================================
// TABS
// ===========================================================================

// OnEraseTabsArea -----------------------------------------------------------
void CDDOVisualManager::OnEraseTabsArea(
    CDC* pDC, CRect rect, const CMFCBaseTabCtrl* /*pTabWnd*/)
{
    ASSERT_VALID(pDC);
    pDC->FillSolidRect(rect, CLR_DDO_BG_DARK);
}

// OnFillTab -----------------------------------------------------------------
void CDDOVisualManager::OnFillTab(
    CDC* pDC, CRect rectFill, CBrush* /*pbrFill*/,
    int /*iTab*/, BOOL bIsActive,
    const CMFCBaseTabCtrl* /*pTabWnd*/)
{
    ASSERT_VALID(pDC);
    pDC->FillSolidRect(rectFill, bIsActive ? CLR_DDO_BG_PANEL : CLR_DDO_BG_DARK);
}

// OnDrawTab -----------------------------------------------------------------
void CDDOVisualManager::OnDrawTab(
    CDC* pDC, CRect rectTab, int iTab, BOOL bIsActive,
    const CMFCBaseTabCtrl* pTabWnd)
{
    ASSERT_VALID(pDC);
    ASSERT_VALID(pTabWnd);

    // Background fill
    pDC->FillSolidRect(rectTab, bIsActive ? CLR_DDO_BG_PANEL : CLR_DDO_BG_DARK);

    // Active tab: 2px gold accent bar at top edge
    if (bIsActive)
    {
        CRect rcAccent(rectTab.left, rectTab.top, rectTab.right, rectTab.top + 2);
        pDC->FillSolidRect(rcAccent, CLR_DDO_GOLD);
    }
    else
    {
        // Thin right-side separator between inactive tabs
        CPen pen(PS_SOLID, 1, CLR_DDO_BORDER);
        CPen* pOld = pDC->SelectObject(&pen);
        pDC->MoveTo(rectTab.right - 1, rectTab.top + 2);
        pDC->LineTo(rectTab.right - 1, rectTab.bottom - 2);
        pDC->SelectObject(pOld);
    }

    // Tab label text
    CString strLabel;
    pTabWnd->GetTabLabel(iTab, strLabel);

    if (!strLabel.IsEmpty())
    {
        COLORREF clrText = bIsActive ? CLR_DDO_GOLD_BRIGHT : CLR_DDO_TEXT_DIM;
        CRect rcText = rectTab;
        rcText.DeflateRect(8, 0);

        pDC->SetTextColor(clrText);
        pDC->SetBkMode(TRANSPARENT);

        CFont* pOldFont = pDC->SelectObject(pTabWnd->GetFont());
        pDC->DrawText(strLabel, rcText,
            DT_CENTER | DT_VCENTER | DT_SINGLELINE | DT_END_ELLIPSIS);
        if (pOldFont)
            pDC->SelectObject(pOldFont);
    }
}

// GetTabTextColor -----------------------------------------------------------
COLORREF CDDOVisualManager::GetTabTextColor(
    const CMFCBaseTabCtrl* /*pTabWnd*/, int /*iTab*/, BOOL bIsActive)
{
    return bIsActive ? CLR_DDO_GOLD_BRIGHT : CLR_DDO_TEXT_DIM;
}

// ===========================================================================
// COMBO BOX
// ===========================================================================

void CDDOVisualManager::OnDrawComboDropButton(
    CDC* pDC, CRect rect, BOOL bDisabled,
    BOOL bIsDropped, BOOL bIsHighlighted,
    CMFCToolBarComboBoxButton* /*pButton*/)
{
    ASSERT_VALID(pDC);

    COLORREF clrBg;
    if      (bDisabled)      clrBg = CLR_DDO_BG_DARK;
    else if (bIsDropped)     clrBg = CLR_DDO_PRESSED;
    else if (bIsHighlighted) clrBg = CLR_DDO_HOVER;
    else                     clrBg = CLR_DDO_BG_MID;

    pDC->FillSolidRect(rect, clrBg);

    // Left border divider
    CPen pen(PS_SOLID, 1, bDisabled ? CLR_DDO_BORDER : CLR_DDO_BORDER_LT);
    CPen* pOld = pDC->SelectObject(&pen);
    pDC->MoveTo(rect.left, rect.top    + 2);
    pDC->LineTo(rect.left, rect.bottom - 2);
    pDC->SelectObject(pOld);

    COLORREF clrArrow = bDisabled ? CLR_DDO_TEXT_DEAD : CLR_DDO_TEXT;
    DrawDropArrow(pDC, rect, clrArrow);
}
