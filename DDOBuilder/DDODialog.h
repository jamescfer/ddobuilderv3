// DDODialog.h – Base CDialog / CDialogEx classes that apply the DDO dark
// theme to every child control via OnCtlColor / OnEraseBkgnd.
#pragma once
#include "DDOTheme.h"

// Shared brush management used by both base classes.
struct DDODialogBrushes
{
    static CBrush s_brPanel;
    static CBrush s_brEdit;
    static CBrush s_brDark;
    static CBrush s_brDarkest;
    static bool   s_bCreated;
    static void Ensure();
};

// ---------------------------------------------------------------------------
// CDDODialog – use as base instead of CDialog
// ---------------------------------------------------------------------------
class CDDODialog : public CDialog
{
protected:
    explicit CDDODialog(UINT nIDTemplate, CWnd* pParent = NULL);
    explicit CDDODialog(LPCTSTR lpszTemplateName, CWnd* pParent = NULL);

    afx_msg HBRUSH OnCtlColor(CDC* pDC, CWnd* pWnd, UINT nCtlColor);
    afx_msg BOOL   OnEraseBkgnd(CDC* pDC);

    DECLARE_MESSAGE_MAP()
};

// ---------------------------------------------------------------------------
// CDDODialogEx – use as base instead of CDialogEx
// ---------------------------------------------------------------------------
class CDDODialogEx : public CDialogEx
{
protected:
    explicit CDDODialogEx(UINT nIDTemplate, CWnd* pParent = NULL);
    explicit CDDODialogEx(LPCTSTR lpszTemplateName, CWnd* pParent = NULL);

    afx_msg HBRUSH OnCtlColor(CDC* pDC, CWnd* pWnd, UINT nCtlColor);
    afx_msg BOOL   OnEraseBkgnd(CDC* pDC);

    DECLARE_MESSAGE_MAP()
};
