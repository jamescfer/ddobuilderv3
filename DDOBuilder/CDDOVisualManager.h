// CDDOVisualManager.h
// Ground-up MFC visual manager for DDOBuilder.
// Derives from the base CMFCVisualManager (no Office 2007 dependency).
// All rendering uses the DDOTheme palette for a modern, flat dark aesthetic.
#pragma once
#include "DDOTheme.h"

class CDDOVisualManager : public CMFCVisualManager
{
    DECLARE_DYNCREATE(CDDOVisualManager)

public:
    CDDOVisualManager();
    virtual ~CDDOVisualManager();

    // ---- Bar backgrounds ------------------------------------------------
    virtual void OnFillBarBackground(
        CDC* pDC, CBasePane* pBar,
        CRect rectClient, CRect rectClip,
        BOOL bNCArea = FALSE) override;

    virtual void OnDrawSeparator(
        CDC* pDC, CBasePane* pBar, CRect rect, BOOL bHorz) override;

    // ---- Toolbar buttons ------------------------------------------------
    virtual void OnFillButtonInterior(
        CDC* pDC, CMFCToolBarButton* pButton,
        CRect rect, AFX_BUTTON_STATE state) override;

    virtual void OnDrawButtonBorder(
        CDC* pDC, CMFCToolBarButton* pButton,
        CRect rect, AFX_BUTTON_STATE state) override;

    // ---- Menu -----------------------------------------------------------
    virtual COLORREF GetMenuItemTextColor(
        CMFCToolBarMenuButton* pButton,
        BOOL bHighlighted, BOOL bDisabled) override;

    virtual void OnHighlightMenuItem(
        CDC* pDC, CMFCToolBarMenuButton* pButton,
        CRect rect, COLORREF& clrText) override;

    virtual void OnHighlightRarelyUsedMenuItems(
        CDC* pDC, CRect rectRarelyUsed) override;

    virtual void OnDrawMenuBorder(
        CDC* pDC, CMFCPopupMenu* pMenu, CRect rect) override;

    virtual void OnFillMenuImageRect(
        CDC* pDC, CMFCToolBarButton* pButton,
        CRect rect, AFX_BUTTON_STATE state) override;

    virtual void OnDrawMenuCheck(
        CDC* pDC, CMFCToolBarMenuButton* pButton,
        CRect rect, BOOL bHighlight, BOOL bIsRadio) override;

    // ---- Popup / floating panel background ------------------------------
    virtual void OnFillPopupWindowBackground(CDC* pDC, CRect rect) override;

    // ---- Tabs -----------------------------------------------------------
    virtual void OnEraseTabsArea(
        CDC* pDC, CRect rect, const CMFCBaseTabCtrl* pTabWnd) override;

    virtual void OnFillTab(
        CDC* pDC, CRect rectFill, CBrush* pbrFill,
        int iTab, BOOL bIsActive,
        const CMFCBaseTabCtrl* pTabWnd) override;

    virtual void OnDrawTab(
        CDC* pDC, CRect rectTab, int iTab, BOOL bIsActive,
        const CMFCBaseTabCtrl* pTabWnd) override;

    virtual COLORREF GetTabTextColor(
        const CMFCBaseTabCtrl* pTabWnd, int iTab, BOOL bIsActive) override;

    // ---- Combo box ------------------------------------------------------
    virtual void OnDrawComboDropButton(
        CDC* pDC, CRect rect, BOOL bDisabled,
        BOOL bIsDropped, BOOL bIsHighlighted,
        CMFCToolBarComboBoxButton* pButton) override;

    // ---- System color refresh -------------------------------------------
    virtual void OnUpdateSystemColors() override;

private:
    CBrush m_brDarkest;
    CBrush m_brDark;
    CBrush m_brMid;
    CBrush m_brPanel;
    CBrush m_brHover;
    CBrush m_brSelect;
    CBrush m_brPressed;

    void RebuildBrushes();

    // Draws a small filled downward triangle centered in rect.
    static void DrawDropArrow(CDC* pDC, CRect rect, COLORREF clr);

    // Draws a minimal checkmark glyph in rect using clr.
    static void DrawCheckGlyph(CDC* pDC, CRect rect, COLORREF clr);

    // Draws a filled circle (radio bullet) in rect using clr.
    static void DrawRadioBullet(CDC* pDC, CRect rect, COLORREF clr);
};
