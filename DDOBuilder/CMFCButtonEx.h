// CMFCButtonEx – CMFCButton subclass with DDO dark-gold theming.
//
#pragma once
#include "DDOTheme.h"

class CMFCButtonEx : public CMFCButton
{
    DECLARE_DYNAMIC(CMFCButtonEx)

public:
    CMFCButtonEx();
    virtual ~CMFCButtonEx();

protected:
    DECLARE_MESSAGE_MAP()

    virtual void OnDraw(CDC* pDC, const CRect& rect, UINT uiState) override;
    virtual void OnDrawFocusRect(CDC* pDC, const CRect& rect) override;

    bool m_bDoneResize;
};
