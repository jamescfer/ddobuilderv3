// CMFCButtonEx.cpp : implementation file
//

#include "stdafx.h"
#include "CMFCButtonEx.h"
#include "DDOTheme.h"
#include "GlobalSupportFunctions.h"

IMPLEMENT_DYNAMIC(CMFCButtonEx, CMFCButton)

CMFCButtonEx::CMFCButtonEx() :
    m_bDoneResize(false)
{
}

CMFCButtonEx::~CMFCButtonEx()
{
}

BEGIN_MESSAGE_MAP(CMFCButtonEx, CMFCButton)
END_MESSAGE_MAP()

// ---------------------------------------------------------------------------
// OnDraw – Full DDO-themed button rendering.
//
// States:
//   Normal:   dark panel background, gold border (dim), parchment text
//   Hover:    slightly lighter bg, bright-gold border
//   Pressed:  darkest bg, gold border, text shifted +1,+1
//   Disabled: very dim colours throughout
// ---------------------------------------------------------------------------
void CMFCButtonEx::OnDraw(CDC* pDC, const CRect& rect, UINT uiState)
{
    const bool bDisabled  = (uiState & ODS_DISABLED)  != 0;
    const bool bPressed   = (uiState & ODS_SELECTED)   != 0;
    const bool bHovered   = m_bHighlighted && !bDisabled;
    const bool bFocused   = (uiState & ODS_FOCUS)      != 0;

    // ---- Background fill -----------------------------------------------
    COLORREF clrBg;
    if      (bDisabled) clrBg = CLR_DDO_BG_DARK;
    else if (bPressed)  clrBg = CLR_DDO_PRESSED;
    else if (bHovered)  clrBg = CLR_DDO_HOVER;
    else                clrBg = CLR_DDO_BG_MID;

    pDC->FillSolidRect(rect, clrBg);

    // ---- Border -----------------------------------------------------------
    COLORREF clrBorder;
    if      (bDisabled) clrBorder = CLR_DDO_BORDER;
    else if (bPressed)  clrBorder = CLR_DDO_GOLD;
    else if (bHovered)  clrBorder = CLR_DDO_GOLD_BRIGHT;
    else                clrBorder = CLR_DDO_GOLD_DARK;

    CRect rcBorder(rect);
    rcBorder.DeflateRect(0, 0, 1, 1);
    pDC->Draw3dRect(rcBorder, clrBorder, clrBorder);

    // Thin inner shadow line for depth (dark line inside the gold border)
    if (!bDisabled)
    {
        CRect rcInner(rect);
        rcInner.DeflateRect(1, 1, 2, 2);
        COLORREF clrShadow = bHovered ? CLR_DDO_BG_LIGHT : CLR_DDO_BG_DARK;
        pDC->Draw3dRect(rcInner, clrShadow, clrShadow);
    }

    // ---- Text + image layout --------------------------------------------
    double dScaleFactor = GetDPIMultiplier(GetSafeHwnd(), true);
    CRect rectText = rect;
    CRect rectImage = rect;
    rectText.DeflateRect(2, 2);

    CString strText;
    GetWindowText(strText);

    CSize sizeImage(m_sizeImage);
    sizeImage.cx = static_cast<LONG>(sizeImage.cx * dScaleFactor);
    sizeImage.cy = static_cast<LONG>(sizeImage.cy * dScaleFactor);

    if (sizeImage.cx != 0)
    {
        if (!strText.IsEmpty())
        {
            if (m_bTopImage)
            {
                rectImage.bottom = rectImage.top + sizeImage.cy + GetVertMargin();
                rectText.top = rectImage.bottom;
                rectText.bottom -= GetVertMargin();
            }
            else if (m_bRightImage)
            {
                rectText.right -= sizeImage.cx + GetImageHorzMargin() / 2;
                rectImage.left  = rectText.right;
                rectImage.right -= GetImageHorzMargin() / 2;
            }
            else
            {
                rectText.left  += sizeImage.cx + GetImageHorzMargin() / 2;
                rectImage.left += GetImageHorzMargin() / 2;
                rectImage.right = rectText.left;
            }
        }
        rectImage.DeflateRect(
            (rectImage.Width()  - sizeImage.cx) / 2,
            max(0, (rectImage.Height() - sizeImage.cy) / 2));
    }
    else
    {
        rectImage.SetRectEmpty();
    }

    // ---- Text -----------------------------------------------------------
    if (!strText.IsEmpty())
    {
        CFont* pOldFont = SelectFont(pDC);
        pDC->SetBkMode(TRANSPARENT);

        COLORREF clrText;
        if      (bDisabled) clrText = CLR_DDO_TEXT_DEAD;
        else if (bHovered)  clrText = CLR_DDO_GOLD_BRIGHT;
        else                clrText = CLR_DDO_TEXT;

        pDC->SetTextColor(clrText);

        if (bPressed)
            rectText.OffsetRect(1, 1);

        UINT uiDTFlags = DT_END_ELLIPSIS | DT_VCENTER | DT_SINGLELINE;
        switch (m_nAlignStyle)
        {
        case ALIGN_LEFT:   uiDTFlags |= DT_LEFT;   rectText.left  += GetImageHorzMargin() / 2; break;
        case ALIGN_RIGHT:  uiDTFlags |= DT_RIGHT;  rectText.right -= GetImageHorzMargin() / 2; break;
        default:           uiDTFlags |= DT_CENTER; break;
        }

        OnDrawText(pDC, rectText, strText, uiDTFlags, uiState);
        pDC->SelectObject(pOldFont);
    }

    // ---- Image ----------------------------------------------------------
    if (!rectImage.IsRectEmpty())
    {
        const bool bIsDisabled = bDisabled && m_bGrayDisabled;

        CMFCToolBarImages& image =
            (bIsDisabled && m_ImageDisabled.GetCount())          ? m_ImageDisabled :
            (m_bHighlighted && m_ImageHot.GetCount())            ? m_ImageHot      :
                                                                   m_Image;
        CMFCToolBarImages& imageChecked =
            (bIsDisabled && m_ImageCheckedDisabled.GetCount())   ? m_ImageCheckedDisabled :
            (m_bHighlighted && m_ImageCheckedHot.GetCount())     ? m_ImageCheckedHot      :
                                                                   m_ImageChecked;

        if (!m_bDoneResize && dScaleFactor != 1.0)
        {
            imageChecked.SmoothResize(dScaleFactor);
            image.SmoothResize(dScaleFactor);
            m_bDoneResize = true;
        }

        if (m_bChecked && imageChecked.GetCount())
        {
            CAfxDrawState ds;
            imageChecked.PrepareDrawImage(ds);
            imageChecked.Draw(pDC, rectImage.left, rectImage.top, 0, FALSE,
                              bIsDisabled && !m_ImageCheckedDisabled.GetCount());
            imageChecked.EndDrawImage(ds);
        }
        else if (image.GetCount())
        {
            CAfxDrawState ds;
            image.PrepareDrawImage(ds);
            image.Draw(pDC, rectImage.left, rectImage.top, 0, FALSE,
                       bIsDisabled && !m_ImageDisabled.GetCount());
            image.EndDrawImage(ds);
        }
    }
}

// ---------------------------------------------------------------------------
// OnDrawFocusRect – Gold dotted focus indicator instead of the default black
// ---------------------------------------------------------------------------
void CMFCButtonEx::OnDrawFocusRect(CDC* pDC, const CRect& rect)
{
    CRect rcFocus(rect);
    rcFocus.DeflateRect(3, 3);
    pDC->SetTextColor(CLR_DDO_GOLD_DIM);
    pDC->DrawFocusRect(rcFocus);
}
