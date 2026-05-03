// CustomTabbedPane.cpp
//
#include "stdafx.h"
#include "CustomTabbedPane.h"
#include "DDOTheme.h"

//---------------------------------------------------------------------------
#pragma warning(push)
#pragma warning(disable: 4407) // warning C4407: cast between different pointer to member representations, compiler may generate incorrect code
BEGIN_MESSAGE_MAP(CCustomTabbedPane, CTabbedPane)
END_MESSAGE_MAP()
#pragma warning(pop)

IMPLEMENT_SERIAL(CCustomTabbedPane, CTabbedPane, VERSIONABLE_SCHEMA | 2)

//---------------------------------------------------------------------------
CCustomTabbedPane::CCustomTabbedPane() :
    CTabbedPane(),
    m_hIcon(0)
{
}

CCustomTabbedPane::~CCustomTabbedPane()
{
}

void CCustomTabbedPane::DrawCaption(CDC* pDC, CRect rectCaption)
{
    const int iconW = ::GetSystemMetrics(SM_CXSMICON);
    const int iconH = ::GetSystemMetrics(SM_CYSMICON);
    const BOOL bActive = IsActive();

    const COLORREF clrTop = bActive ? CLR_DDO_CAP_ACTIVE_TOP : CLR_DDO_CAP_TOP;
    const COLORREF clrBtm = bActive ? CLR_DDO_CAP_ACTIVE_BTM : CLR_DDO_CAP_BTM;

    // Full caption gradient
    {
        TRIVERTEX tv[2];
        tv[0].x     = rectCaption.left;
        tv[0].y     = rectCaption.top;
        tv[0].Red   = (COLOR16)((WORD)GetRValue(clrTop) << 8);
        tv[0].Green = (COLOR16)((WORD)GetGValue(clrTop) << 8);
        tv[0].Blue  = (COLOR16)((WORD)GetBValue(clrTop) << 8);
        tv[0].Alpha = 0;
        tv[1].x     = rectCaption.right;
        tv[1].y     = rectCaption.bottom;
        tv[1].Red   = (COLOR16)((WORD)GetRValue(clrBtm) << 8);
        tv[1].Green = (COLOR16)((WORD)GetGValue(clrBtm) << 8);
        tv[1].Blue  = (COLOR16)((WORD)GetBValue(clrBtm) << 8);
        tv[1].Alpha = 0;
        GRADIENT_RECT gr = { 0, 1 };
        ::GradientFill(pDC->GetSafeHdc(), tv, 2, &gr, 1, GRADIENT_FILL_RECT_V);
    }

    // Draw the active tab's icon
    int iTab = m_pTabWnd->GetActiveTab();
    if (iTab >= 0)
    {
        HICON hIcon = m_pTabWnd->GetTabHicon(iTab);
        if (hIcon)
        {
            const int iconX = rectCaption.left + 2;
            const int iconY = rectCaption.top + (rectCaption.Height() - iconH) / 2;
            ::DrawIconEx(pDC->GetSafeHdc(), iconX, iconY,
                    hIcon, iconW, iconH, 0, NULL, DI_NORMAL);

            // Bevelled frame around the icon (orange when active, gold otherwise)
            CRect rctIcon(iconX - 1, iconY - 1, iconX + iconW + 1, iconY + iconH + 1);
            COLORREF clrFrameOuter = bActive ? CLR_DDO_ORANGE     : CLR_DDO_GOLD_DARK;
            COLORREF clrFrameInner = bActive ? CLR_DDO_ORANGE_DIM : CLR_DDO_GOLD_DIM;
            CPen penOuter(PS_SOLID, 1, clrFrameOuter);
            CPen penInner(PS_SOLID, 1, clrFrameInner);
            CPen* pOld = pDC->SelectObject(&penOuter);
            pDC->MoveTo(rctIcon.left,       rctIcon.bottom - 1);
            pDC->LineTo(rctIcon.left,       rctIcon.top);
            pDC->LineTo(rctIcon.right - 1,  rctIcon.top);
            pDC->SelectObject(&penInner);
            pDC->MoveTo(rctIcon.right - 1,  rctIcon.top);
            pDC->LineTo(rctIcon.right - 1,  rctIcon.bottom - 1);
            pDC->LineTo(rctIcon.left,       rctIcon.bottom - 1);
            pDC->SelectObject(pOld);
        }
    }

    // Title text and pin/close buttons
    pDC->SetBkMode(TRANSPARENT);
    pDC->SetTextColor(bActive ? CLR_DDO_GOLD_BRIGHT : CLR_DDO_TEXT_DIM);
    CRect rcText = rectCaption;
    rcText.left += iconW + 6;
    CTabbedPane::DrawCaption(pDC, rcText);

    // Accent line along full bottom edge – orange when active, red otherwise
    COLORREF clrLine = bActive ? CLR_DDO_ORANGE : CLR_DDO_RED;
    CPen penLine(PS_SOLID, bActive ? 2 : 1, clrLine);
    CPen* pOld = pDC->SelectObject(&penLine);
    pDC->MoveTo(rectCaption.left,  rectCaption.bottom - 1);
    pDC->LineTo(rectCaption.right, rectCaption.bottom - 1);
    pDC->SelectObject(pOld);
}
