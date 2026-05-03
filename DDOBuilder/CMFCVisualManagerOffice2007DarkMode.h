#pragma once
#include <afxvisualmanageroffice2007.h>

class CMFCVisualManagerOffice2007DarkMode :
    public CMFCVisualManagerOffice2007
{
    DECLARE_DYNCREATE(CMFCVisualManagerOffice2007DarkMode)

    CMFCVisualManagerOffice2007DarkMode();
public:
    void UpdateColours();

    // Pane caption bars (dockable pane title strips)
    virtual void OnDrawPaneCaption(
        CDC* pDC, CDockablePane* pBar, BOOL bActive,
        CRect rectCaption, CRect rectButtons) override;

    // Client area background for toolbars / menu bars / dockable pane backgrounds
    virtual void OnFillBarBackground(
        CDC* pDC, CBasePane* pBar,
        CRect rectClient, CRect rectClip,
        BOOL bNCArea = FALSE) override;
};
