// DDOFormView.cpp
//
#include "stdafx.h"
#include "DDOFormView.h"

BEGIN_MESSAGE_MAP(CDDOFormView, CFormView)
    ON_WM_CTLCOLOR()
    ON_WM_ERASEBKGND()
END_MESSAGE_MAP()

// Static brush storage -------------------------------------------------------
CBrush CDDOFormView::s_brPanel;
CBrush CDDOFormView::s_brEdit;
CBrush CDDOFormView::s_brDark;
CBrush CDDOFormView::s_brDarkest;
bool   CDDOFormView::s_bBrushesCreated = false;

void CDDOFormView::EnsureBrushes()
{
    if (!s_bBrushesCreated)
    {
        s_brPanel.CreateSolidBrush(CLR_DDO_BG_PANEL);
        s_brEdit.CreateSolidBrush(CLR_DDO_BG_MID);
        s_brDark.CreateSolidBrush(CLR_DDO_BG_DARK);
        s_brDarkest.CreateSolidBrush(CLR_DDO_BG_DARKEST);
        s_bBrushesCreated = true;
    }
}

// Construction ---------------------------------------------------------------
CDDOFormView::CDDOFormView(UINT nIDTemplate) :
    CFormView(nIDTemplate)
{
    EnsureBrushes();
}

CDDOFormView::CDDOFormView(LPCTSTR lpszTemplateName) :
    CFormView(lpszTemplateName)
{
    EnsureBrushes();
}

CDDOFormView::~CDDOFormView()
{
}

// OnEraseBkgnd ---------------------------------------------------------------
BOOL CDDOFormView::OnEraseBkgnd(CDC* pDC)
{
    EnsureBrushes();
    CRect rcClient;
    GetClientRect(&rcClient);
    pDC->FillSolidRect(&rcClient, CLR_DDO_BG_PANEL);
    return TRUE;
}

// OnCtlColor -----------------------------------------------------------------
// Returns DDO-themed brushes and sets text/bg colours for every standard
// control type.  Derived classes that need extra logic should call
// CDDOFormView::OnCtlColor() as their base and then add overrides.
//
HBRUSH CDDOFormView::OnCtlColor(CDC* pDC, CWnd* pWnd, UINT nCtlColor)
{
    EnsureBrushes();

    switch (nCtlColor)
    {
    case CTLCOLOR_EDIT:
        pDC->SetTextColor(CLR_DDO_TEXT);
        pDC->SetBkColor(CLR_DDO_BG_MID);
        return (HBRUSH)s_brEdit;

    case CTLCOLOR_LISTBOX:
        pDC->SetTextColor(CLR_DDO_TEXT);
        pDC->SetBkColor(CLR_DDO_BG_DARK);
        return (HBRUSH)s_brDark;

    case CTLCOLOR_SCROLLBAR:
        return (HBRUSH)s_brDarkest;

    case CTLCOLOR_BTN:
        // Radio buttons and checkboxes: transparent background so the
        // parent's dark fill shows through; text is DDO parchment.
        pDC->SetTextColor(CLR_DDO_TEXT);
        pDC->SetBkMode(TRANSPARENT);
        return (HBRUSH)s_brPanel;

    case CTLCOLOR_STATIC:
    {
        DWORD dwStyle = pWnd ? pWnd->GetStyle() : 0;
        DWORD dwType  = dwStyle & SS_TYPEMASK;

        if (dwType == 0x00000007L) // SS_GROUPBOX
        {
            // Group box frame: gold text on transparent bg so the parent
            // panel colour shows through the interior.
            pDC->SetTextColor(CLR_DDO_GOLD_DARK);
            pDC->SetBkMode(TRANSPARENT);
            return (HBRUSH)s_brPanel;
        }
        else
        {
            // Labels, separators, etc.
            pDC->SetTextColor(CLR_DDO_TEXT);
            pDC->SetBkMode(TRANSPARENT);
            return (HBRUSH)s_brPanel;
        }
    }

    default:
        break;
    }

    // Fallback: let MFC decide (keeps CMFCButton / custom controls intact)
    return CFormView::OnCtlColor(pDC, pWnd, nCtlColor);
}

// Helpers for list / tree / tab controls -------------------------------------
void CDDOFormView::ApplyDDOTheme(CListCtrl& lc)
{
    lc.SetBkColor(CLR_DDO_BG_DARK);
    lc.SetTextBkColor(CLR_DDO_BG_DARK);
    lc.SetTextColor(CLR_DDO_TEXT);
    lc.SetExtendedStyle(lc.GetExtendedStyle() | LVS_EX_FULLROWSELECT | LVS_EX_GRIDLINES);
}

void CDDOFormView::ApplyDDOTheme(CTreeCtrl& tc)
{
    tc.SetBkColor(CLR_DDO_BG_DARK);
    tc.SetTextColor(CLR_DDO_TEXT);
    tc.SetLineColor(CLR_DDO_BORDER);
}

void CDDOFormView::ApplyDDOTheme(CTabCtrl& tab)
{
    // Owner-draw lets the visual manager / pane handle tab rendering
    tab.ModifyStyle(0, TCS_OWNERDRAWFIXED);
}
