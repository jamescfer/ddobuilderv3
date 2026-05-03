#include "stdafx.h"
#include "CMFCVisualManagerOffice2007DarkMode.h"
#include "DDOTheme.h"

IMPLEMENT_DYNCREATE(CMFCVisualManagerOffice2007DarkMode, CMFCVisualManagerOffice2007)

CMFCVisualManagerOffice2007DarkMode::CMFCVisualManagerOffice2007DarkMode()
{
    m_clrEditBorder           = CLR_DDO_BORDER_LT;
    m_clrEditSelection        = CLR_DDO_SELECT;
    m_clrMainClientArea       = CLR_DDO_BG_DARKEST;
    m_clrMenuText             = CLR_DDO_TEXT;
}

// ---------------------------------------------------------------------------
// UpdateColours – applies the full DDO palette over the Office2007 base.
// Called after SetStyle(ObsidianBlack) so the base resources are the darkest
// available before we override individual colour slots.
// ---------------------------------------------------------------------------
void CMFCVisualManagerOffice2007DarkMode::UpdateColours()
{
    // Tooltips
    m_ToolTipParams.m_clrText       = CLR_DDO_TIP_TEXT;
    m_ToolTipParams.m_clrFill       = CLR_DDO_TIP_BG;
    m_ToolTipParams.m_clrFillGradient = CLR_DDO_BG_MID;
    m_ToolTipParams.m_clrBorder     = CLR_DDO_TIP_BORDER;

    // Menu
    m_clrMenuLight              = CLR_DDO_BG_MID;
    m_clrHighlight              = CLR_DDO_HOVER;
    m_clrHighlightDn            = CLR_DDO_PRESSED;
    m_clrHighlightChecked       = CLR_DDO_SELECT;
    m_clrMenuBorder             = CLR_DDO_BORDER_LT;
    m_clrMenuItemBorder         = CLR_DDO_BORDER;

    m_brMenuLight.DeleteObject();
    m_brMenuLight.CreateSolidBrush(CLR_DDO_BG_MID);

    m_brMainClientArea.DeleteObject();
    m_brMainClientArea.CreateSolidBrush(CLR_DDO_BG_DARKEST);

    // Toolbar
    m_clrToolBarGradientDark    = CLR_DDO_BG_DARK;
    m_clrToolBarGradientLight   = CLR_DDO_BG_MID;

    // App caption (title bar)
    m_clrAppCaptionActiveText   = CLR_DDO_GOLD_BRIGHT;
    m_clrAppCaptionInactiveText = CLR_DDO_TEXT_DIM;
    m_clrMainClientArea         = CLR_DDO_BG_DARKEST;

    // Menu bar text
    m_clrMenuBarBtnText             = CLR_DDO_TEXT;
    m_clrMenuBarBtnTextHighlighted  = CLR_DDO_GOLD_BRIGHT;
    m_clrMenuBarBtnTextDisabled     = CLR_DDO_TEXT_DEAD;

    // Toolbar button text
    m_clrToolBarBtnText             = CLR_DDO_TEXT;
    m_clrToolBarBtnTextHighlighted  = CLR_DDO_GOLD_BRIGHT;
    m_clrToolBarBtnTextDisabled     = CLR_DDO_TEXT_DEAD;

    // Menu text
    m_clrMenuText           = CLR_DDO_TEXT;
    m_clrMenuTextHighlighted = CLR_DDO_GOLD_BRIGHT;
    m_clrMenuTextDisabled   = CLR_DDO_TEXT_DEAD;

    // Popup gradient background
    m_clrPopupGradientLight = CLR_DDO_BG_MID;
    m_clrPopupGradientDark  = CLR_DDO_BG_DARK;

    // Combo boxes
    m_clrComboBorder                  = CLR_DDO_BORDER_LT;
    m_clrComboBorderDisabled          = CLR_DDO_BORDER;
    m_clrComboBorderPressed           = CLR_DDO_GOLD;
    m_clrComboBorderHighlighted       = CLR_DDO_GOLD_DARK;
    m_clrComboBtnStart                = CLR_DDO_BG_MID;
    m_clrComboBtnFinish               = CLR_DDO_BG_DARK;
    m_clrComboBtnBorder               = CLR_DDO_BORDER_LT;
    m_clrComboBtnDisabledStart        = CLR_DDO_BG_DARK;
    m_clrComboBtnDisabledFinish       = CLR_DDO_BG_DARK;
    m_clrComboBtnBorderDisabled       = CLR_DDO_BORDER;
    m_clrComboBtnPressedStart         = CLR_DDO_PRESSED;
    m_clrComboBtnPressedFinish        = CLR_DDO_SELECT;
    m_clrComboBtnBorderPressed        = CLR_DDO_GOLD;
    m_clrComboBtnHighlightedStart     = CLR_DDO_HOVER;
    m_clrComboBtnHighlightedFinish    = CLR_DDO_BG_MID;
    m_clrComboBtnBorderHighlighted    = CLR_DDO_GOLD_DARK;
    m_clrComboSelection               = CLR_DDO_SELECT;

    // Tabs
    m_clrTabFlatBlack       = CLR_DDO_BG_DARK;
    m_clrTabFlatHighlight   = CLR_DDO_HOVER;
    m_clrTabTextActive      = CLR_DDO_GOLD_BRIGHT;
    m_clrTabTextInactive    = CLR_DDO_TEXT_DIM;

    // Outlook / caption text
    m_clrOutlookPageTextNormal      = CLR_DDO_TEXT;
    m_clrOutlookPageTextHighlighted = CLR_DDO_GOLD_BRIGHT;
    m_clrOutlookPageTextPressed     = CLR_DDO_GOLD;
    m_clrOutlookCaptionTextNormal   = CLR_DDO_TEXT_DIM;

    // Task pane group captions
    m_clrTaskPaneGroupCaptionHighDark       = CLR_DDO_CAP_TOP;
    m_clrTaskPaneGroupCaptionHighLight      = CLR_DDO_CAP_BTM;
    m_clrTaskPaneGroupCaptionHighSpecDark   = CLR_DDO_GOLD_DIM;
    m_clrTaskPaneGroupCaptionHighSpecLight  = CLR_DDO_GOLD_DARK;
    m_clrTaskPaneGroupCaptionTextSpec       = CLR_DDO_GOLD_BRIGHT;
    m_clrTaskPaneGroupCaptionTextHighSpec   = CLR_DDO_GOLD_BRIGHT;
    m_clrTaskPaneGroupCaptionText           = CLR_DDO_TEXT;
    m_clrTaskPaneGroupCaptionTextHigh       = CLR_DDO_GOLD_BRIGHT;

    // Ribbon (colours referenced but ribbon is not used – keep them neutral)
    m_clrRibbonCategoryText             = CLR_DDO_TEXT;
    m_clrRibbonCategoryTextHighlighted  = CLR_DDO_GOLD_BRIGHT;
    m_clrRibbonCategoryTextDisabled     = CLR_DDO_TEXT_DEAD;
    m_clrRibbonPanelText                = CLR_DDO_TEXT;
    m_clrRibbonPanelTextHighlighted     = CLR_DDO_GOLD_BRIGHT;
    m_clrRibbonPanelCaptionText         = CLR_DDO_TEXT_DIM;
    m_clrRibbonPanelCaptionTextHighlighted = CLR_DDO_GOLD_BRIGHT;
    m_clrRibbonKeyTipTextNormal         = CLR_DDO_TEXT;
    m_clrRibbonKeyTipTextDisabled       = CLR_DDO_TEXT_DEAD;
    m_clrRibbonEdit                     = CLR_DDO_BG_MID;
    m_clrRibbonEditDisabled             = CLR_DDO_BG_DARK;
    m_clrRibbonEditHighlighted          = CLR_DDO_HOVER;
    m_clrRibbonEditPressed              = CLR_DDO_SELECT;
    m_clrRibbonEditBorder               = CLR_DDO_BORDER_LT;
    m_clrRibbonEditBorderDisabled       = CLR_DDO_BORDER;
    m_clrRibbonEditBorderHighlighted    = CLR_DDO_GOLD_DARK;
    m_clrRibbonEditBorderPressed        = CLR_DDO_GOLD;
    m_clrRibbonEditSelection            = CLR_DDO_SELECT;
    m_clrRibbonComboBtnStart            = CLR_DDO_BG_MID;
    m_clrRibbonComboBtnFinish           = CLR_DDO_BG_DARK;
    m_clrRibbonComboBtnBorder           = CLR_DDO_BORDER_LT;
    m_clrRibbonComboBtnDisabledStart    = CLR_DDO_BG_DARK;
    m_clrRibbonComboBtnDisabledFinish   = CLR_DDO_BG_DARK;
    m_clrRibbonComboBtnBorderDisabled   = CLR_DDO_BORDER;
    m_clrRibbonComboBtnPressedStart     = CLR_DDO_PRESSED;
    m_clrRibbonComboBtnPressedFinish    = CLR_DDO_SELECT;
    m_clrRibbonComboBtnBorderPressed    = CLR_DDO_GOLD;
    m_clrRibbonComboBtnHighlightedStart = CLR_DDO_HOVER;
    m_clrRibbonComboBtnHighlightedFinish = CLR_DDO_BG_MID;
    m_clrRibbonComboBtnBorderHighlighted = CLR_DDO_GOLD_DARK;
    m_clrRibbonContextPanelText                  = CLR_DDO_TEXT;
    m_clrRibbonContextPanelTextHighlighted       = CLR_DDO_GOLD_BRIGHT;
    m_clrRibbonContextPanelCaptionText           = CLR_DDO_TEXT_DIM;
    m_clrRibbonContextPanelCaptionTextHighlighted = CLR_DDO_GOLD_BRIGHT;
}

// ---------------------------------------------------------------------------
// OnDrawPaneCaption
// Draws a DDO-styled gradient header for every dockable pane caption bar.
// The base class (CDockablePane::DrawCaption) calls this after shifting the
// rect past the icon that CCustomDockablePane draws first.
// ---------------------------------------------------------------------------
void CMFCVisualManagerOffice2007DarkMode::OnDrawPaneCaption(
    CDC* pDC, CDockablePane* pBar,
    BOOL bActive, CRect rectCaption, CRect rectButtons)
{
    // Vertical gradient: darker at top, slightly lighter at bottom
    TRIVERTEX tv[2];
    tv[0].x     = rectCaption.left;
    tv[0].y     = rectCaption.top;
    tv[0].Red   = (COLOR16)(GetRValue(CLR_DDO_CAP_TOP)  << 8);
    tv[0].Green = (COLOR16)(GetGValue(CLR_DDO_CAP_TOP)  << 8);
    tv[0].Blue  = (COLOR16)(GetBValue(CLR_DDO_CAP_TOP)  << 8);
    tv[0].Alpha = 0;
    tv[1].x     = rectCaption.right;
    tv[1].y     = rectCaption.bottom;
    tv[1].Red   = (COLOR16)(GetRValue(CLR_DDO_CAP_BTM) << 8);
    tv[1].Green = (COLOR16)(GetGValue(CLR_DDO_CAP_BTM) << 8);
    tv[1].Blue  = (COLOR16)(GetBValue(CLR_DDO_CAP_BTM) << 8);
    tv[1].Alpha = 0;
    GRADIENT_RECT gr = { 0, 1 };
    ::GradientFill(pDC->GetSafeHdc(), tv, 2, &gr, 1, GRADIENT_FILL_RECT_V);

    // Gold accent line along the bottom of the caption
    COLORREF clrLine = bActive ? CLR_DDO_GOLD : CLR_DDO_GOLD_DIM;
    CPen pen(PS_SOLID, 1, clrLine);
    CPen* pOld = pDC->SelectObject(&pen);
    pDC->MoveTo(rectCaption.left,  rectCaption.bottom - 1);
    pDC->LineTo(rectCaption.right, rectCaption.bottom - 1);
    pDC->SelectObject(pOld);

    // Title text
    CString strTitle;
    pBar->GetWindowText(strTitle);
    if (!strTitle.IsEmpty())
    {
        CRect rectText = rectCaption;
        rectText.DeflateRect(4, 1);
        if (!rectButtons.IsRectEmpty())
            rectText.right = rectButtons.left - 2;

        pDC->SetBkMode(TRANSPARENT);
        pDC->SetTextColor(bActive ? CLR_DDO_GOLD_BRIGHT : CLR_DDO_TEXT_DIM);
        CFont* pOldFont = (CFont*)pDC->SelectStockObject(DEFAULT_GUI_FONT);
        pDC->DrawText(strTitle, rectText,
            DT_LEFT | DT_VCENTER | DT_SINGLELINE | DT_END_ELLIPSIS);
        pDC->SelectObject(pOldFont);
    }
}

// ---------------------------------------------------------------------------
// OnFillBarBackground
// Fills toolbar, menu-bar, and dockable pane backgrounds with DDO colours.
// bNCArea = TRUE  →  non-client / caption strip → use caption gradient
// bNCArea = FALSE →  client area of the bar     → use panel background
// ---------------------------------------------------------------------------
void CMFCVisualManagerOffice2007DarkMode::OnFillBarBackground(
    CDC* pDC, CBasePane* pBar,
    CRect rectClient, CRect rectClip, BOOL bNCArea)
{
    ASSERT_VALID(pDC);
    ASSERT_VALID(pBar);

    CRect rectFill = rectClip.IsRectEmpty() ? rectClient : rectClip;

    if (bNCArea)
    {
        // Non-client (caption / border) area: same vertical gradient as captions
        TRIVERTEX tv[2];
        tv[0].x     = rectClient.left;
        tv[0].y     = rectClient.top;
        tv[0].Red   = (COLOR16)(GetRValue(CLR_DDO_CAP_TOP)  << 8);
        tv[0].Green = (COLOR16)(GetGValue(CLR_DDO_CAP_TOP)  << 8);
        tv[0].Blue  = (COLOR16)(GetBValue(CLR_DDO_CAP_TOP)  << 8);
        tv[0].Alpha = 0;
        tv[1].x     = rectClient.right;
        tv[1].y     = rectClient.bottom;
        tv[1].Red   = (COLOR16)(GetRValue(CLR_DDO_CAP_BTM) << 8);
        tv[1].Green = (COLOR16)(GetGValue(CLR_DDO_CAP_BTM) << 8);
        tv[1].Blue  = (COLOR16)(GetBValue(CLR_DDO_CAP_BTM) << 8);
        tv[1].Alpha = 0;
        GRADIENT_RECT gr = { 0, 1 };
        ::GradientFill(pDC->GetSafeHdc(), tv, 2, &gr, 1, GRADIENT_FILL_RECT_V);
    }
    else
    {
        pDC->FillSolidRect(rectFill, CLR_DDO_BG_PANEL);
    }
}
