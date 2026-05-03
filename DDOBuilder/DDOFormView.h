// DDOFormView.h – Base CFormView that applies the DDO dark theme to every
// standard child control via OnCtlColor / OnEraseBkgnd.  All dockable-pane
// views inherit from this class instead of CFormView directly.
//
#pragma once
#include "DDOTheme.h"

class CDDOFormView : public CFormView
{
protected:
    explicit CDDOFormView(UINT nIDTemplate);
    explicit CDDOFormView(LPCTSTR lpszTemplateName);
    virtual ~CDDOFormView();

    // Call once in pane's OnInitialUpdate to apply DDO colours to a CListCtrl.
    static void ApplyDDOTheme(CListCtrl& lc);
    // Call once in pane's OnInitialUpdate to apply DDO colours to a CTreeCtrl.
    static void ApplyDDOTheme(CTreeCtrl& tc);
    // Apply DDO colours to any CTabCtrl (sets owner-draw flag).
    static void ApplyDDOTheme(CTabCtrl& tab);

    afx_msg HBRUSH OnCtlColor(CDC* pDC, CWnd* pWnd, UINT nCtlColor);
    afx_msg BOOL   OnEraseBkgnd(CDC* pDC);

    DECLARE_MESSAGE_MAP()

private:
    static CBrush s_brPanel;   // CLR_DDO_BG_PANEL
    static CBrush s_brEdit;    // CLR_DDO_BG_MID
    static CBrush s_brDark;    // CLR_DDO_BG_DARK
    static CBrush s_brDarkest; // CLR_DDO_BG_DARKEST
    static bool   s_bBrushesCreated;

    static void EnsureBrushes();
};
