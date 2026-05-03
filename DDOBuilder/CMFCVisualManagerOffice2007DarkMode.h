#pragma once
#include <afxvisualmanageroffice2007.h>

class CMFCVisualManagerOffice2007DarkMode :
    public CMFCVisualManagerOffice2007
{
    DECLARE_DYNCREATE(CMFCVisualManagerOffice2007DarkMode)

    CMFCVisualManagerOffice2007DarkMode();
public:
    void UpdateColours();

    // Client area background for toolbars / menu bars / dockable pane backgrounds
    virtual void OnFillBarBackground(
        CDC* pDC, CBasePane* pBar,
        CRect rectClient, CRect rectClip,
        BOOL bNCArea = FALSE) override;

    // Popup / dialog / form-view client area fill (used by OnEraseBackground helper)
    virtual void OnFillPopupWindowBackground(CDC* pDC, CRect rect) override;

    // List-control header background
    virtual void OnDrawControlBorder(CDC* pDC, CRect rect, CWnd* pWndCtrl, BOOL bDrawOnGlass) override;

    // Highlighted / selected button inside a toolbar
    virtual void OnHighlightMenuItem(CDC* pDC, CMFCToolBarMenuButton* pButton,
        CSize sizeMenuItem, int& nHighlightedItem) override;
};
