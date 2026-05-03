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

    // Fill the icon strip with the DDO caption gradient so it matches
    // the rest of the caption drawn by the visual manager
    {
        TRIVERTEX tv[2];
        tv[0].x     = rectCaption.left;
        tv[0].y     = rectCaption.top;
        tv[0].Red   = (COLOR16)(GetRValue(CLR_DDO_CAP_TOP) << 8);
        tv[0].Green = (COLOR16)(GetGValue(CLR_DDO_CAP_TOP) << 8);
        tv[0].Blue  = (COLOR16)(GetBValue(CLR_DDO_CAP_TOP) << 8);
        tv[0].Alpha = 0;
        tv[1].x     = rectCaption.left + iconW + 6;
        tv[1].y     = rectCaption.bottom;
        tv[1].Red   = (COLOR16)(GetRValue(CLR_DDO_CAP_BTM) << 8);
        tv[1].Green = (COLOR16)(GetGValue(CLR_DDO_CAP_BTM) << 8);
        tv[1].Blue  = (COLOR16)(GetBValue(CLR_DDO_CAP_BTM) << 8);
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

            // Gold bevelled frame around the icon
            CRect rctIcon(iconX - 1, iconY - 1, iconX + iconW + 1, iconY + iconH + 1);
            CPen penOuter(PS_SOLID, 1, CLR_DDO_GOLD_DARK);
            CPen penInner(PS_SOLID, 1, CLR_DDO_GOLD_DIM);
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

    // Base class draws title text and pin/close buttons
    CRect rcText = rectCaption;
    rcText.left += iconW + 6;
    CTabbedPane::DrawCaption(pDC, rcText);

    // Gold accent line at the full bottom edge, always on top
    CPen penGold(PS_SOLID, 1, CLR_DDO_GOLD);
    CPen* pOld = pDC->SelectObject(&penGold);
    pDC->MoveTo(rectCaption.left,  rectCaption.bottom - 1);
    pDC->LineTo(rectCaption.right, rectCaption.bottom - 1);
    pDC->SelectObject(pOld);
}
