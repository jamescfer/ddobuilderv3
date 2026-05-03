// DDODialog.cpp – Implementations of CDDODialog and CDDODialogEx.
//
#include "stdafx.h"
#include "DDODialog.h"

// ---------------------------------------------------------------------------
// DDODialogBrushes – shared brush storage
// ---------------------------------------------------------------------------
CBrush DDODialogBrushes::s_brPanel;
CBrush DDODialogBrushes::s_brEdit;
CBrush DDODialogBrushes::s_brDark;
CBrush DDODialogBrushes::s_brDarkest;
bool   DDODialogBrushes::s_bCreated = false;

void DDODialogBrushes::Ensure()
{
    if (!s_bCreated)
    {
        s_brPanel.CreateSolidBrush(CLR_DDO_BG_PANEL);
        s_brEdit.CreateSolidBrush(CLR_DDO_BG_MID);
        s_brDark.CreateSolidBrush(CLR_DDO_BG_DARK);
        s_brDarkest.CreateSolidBrush(CLR_DDO_BG_DARKEST);
        s_bCreated = true;
    }
}

// ---------------------------------------------------------------------------
// CDDODialog
// ---------------------------------------------------------------------------
BEGIN_MESSAGE_MAP(CDDODialog, CDialog)
    ON_WM_CTLCOLOR()
    ON_WM_ERASEBKGND()
END_MESSAGE_MAP()

CDDODialog::CDDODialog(UINT nIDTemplate, CWnd* pParent) :
    CDialog(nIDTemplate, pParent)
{
    DDODialogBrushes::Ensure();
}

CDDODialog::CDDODialog(LPCTSTR lpszTemplateName, CWnd* pParent) :
    CDialog(lpszTemplateName, pParent)
{
    DDODialogBrushes::Ensure();
}

BOOL CDDODialog::OnEraseBkgnd(CDC* pDC)
{
    DDODialogBrushes::Ensure();
    CRect rcClient;
    GetClientRect(&rcClient);
    pDC->FillSolidRect(&rcClient, CLR_DDO_BG_PANEL);
    return TRUE;
}

HBRUSH CDDODialog::OnCtlColor(CDC* pDC, CWnd* pWnd, UINT nCtlColor)
{
    DDODialogBrushes::Ensure();

    switch (nCtlColor)
    {
    case CTLCOLOR_EDIT:
        pDC->SetTextColor(CLR_DDO_TEXT);
        pDC->SetBkColor(CLR_DDO_BG_MID);
        return (HBRUSH)DDODialogBrushes::s_brEdit;

    case CTLCOLOR_LISTBOX:
        pDC->SetTextColor(CLR_DDO_TEXT);
        pDC->SetBkColor(CLR_DDO_BG_DARK);
        return (HBRUSH)DDODialogBrushes::s_brDark;

    case CTLCOLOR_SCROLLBAR:
        return (HBRUSH)DDODialogBrushes::s_brDarkest;

    case CTLCOLOR_BTN:
        pDC->SetTextColor(CLR_DDO_TEXT);
        pDC->SetBkMode(TRANSPARENT);
        return (HBRUSH)DDODialogBrushes::s_brPanel;

    case CTLCOLOR_STATIC:
    {
        DWORD dwStyle = pWnd ? pWnd->GetStyle() : 0;
        DWORD dwType  = dwStyle & SS_TYPEMASK;

        if (dwType == 0x00000007L) // SS_GROUPBOX
        {
            pDC->SetTextColor(CLR_DDO_GOLD_DARK);
            pDC->SetBkMode(TRANSPARENT);
            return (HBRUSH)DDODialogBrushes::s_brPanel;
        }
        else
        {
            pDC->SetTextColor(CLR_DDO_TEXT);
            pDC->SetBkMode(TRANSPARENT);
            return (HBRUSH)DDODialogBrushes::s_brPanel;
        }
    }

    default:
        break;
    }

    return CDialog::OnCtlColor(pDC, pWnd, nCtlColor);
}

// ---------------------------------------------------------------------------
// CDDODialogEx
// ---------------------------------------------------------------------------
BEGIN_MESSAGE_MAP(CDDODialogEx, CDialogEx)
    ON_WM_CTLCOLOR()
    ON_WM_ERASEBKGND()
END_MESSAGE_MAP()

CDDODialogEx::CDDODialogEx(UINT nIDTemplate, CWnd* pParent) :
    CDialogEx(nIDTemplate, pParent)
{
    DDODialogBrushes::Ensure();
}

CDDODialogEx::CDDODialogEx(LPCTSTR lpszTemplateName, CWnd* pParent) :
    CDialogEx(lpszTemplateName, pParent)
{
    DDODialogBrushes::Ensure();
}

BOOL CDDODialogEx::OnEraseBkgnd(CDC* pDC)
{
    DDODialogBrushes::Ensure();
    CRect rcClient;
    GetClientRect(&rcClient);
    pDC->FillSolidRect(&rcClient, CLR_DDO_BG_PANEL);
    return TRUE;
}

HBRUSH CDDODialogEx::OnCtlColor(CDC* pDC, CWnd* pWnd, UINT nCtlColor)
{
    DDODialogBrushes::Ensure();

    switch (nCtlColor)
    {
    case CTLCOLOR_EDIT:
        pDC->SetTextColor(CLR_DDO_TEXT);
        pDC->SetBkColor(CLR_DDO_BG_MID);
        return (HBRUSH)DDODialogBrushes::s_brEdit;

    case CTLCOLOR_LISTBOX:
        pDC->SetTextColor(CLR_DDO_TEXT);
        pDC->SetBkColor(CLR_DDO_BG_DARK);
        return (HBRUSH)DDODialogBrushes::s_brDark;

    case CTLCOLOR_SCROLLBAR:
        return (HBRUSH)DDODialogBrushes::s_brDarkest;

    case CTLCOLOR_BTN:
        pDC->SetTextColor(CLR_DDO_TEXT);
        pDC->SetBkMode(TRANSPARENT);
        return (HBRUSH)DDODialogBrushes::s_brPanel;

    case CTLCOLOR_STATIC:
    {
        DWORD dwStyle = pWnd ? pWnd->GetStyle() : 0;
        DWORD dwType  = dwStyle & SS_TYPEMASK;

        if (dwType == 0x00000007L) // SS_GROUPBOX
        {
            pDC->SetTextColor(CLR_DDO_GOLD_DARK);
            pDC->SetBkMode(TRANSPARENT);
            return (HBRUSH)DDODialogBrushes::s_brPanel;
        }
        else
        {
            pDC->SetTextColor(CLR_DDO_TEXT);
            pDC->SetBkMode(TRANSPARENT);
            return (HBRUSH)DDODialogBrushes::s_brPanel;
        }
    }

    default:
        break;
    }

    return CDialogEx::OnCtlColor(pDC, pWnd, nCtlColor);
}
