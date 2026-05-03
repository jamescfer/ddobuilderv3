// CustomDockablePane.cpp
//
#include "stdafx.h"
#include "CustomDockablePane.h"
#include "CustomTabbedPane.h"
#include "CustomMultiPaneFrameWnd.h"
#include "CustomContextMenuManager.h"
#include "DDOTheme.h"

//---------------------------------------------------------------------------
#pragma warning(push)
#pragma warning(disable: 4407) // warning C4407: cast between different pointer to member representations, compiler may generate incorrect code
BEGIN_MESSAGE_MAP(CCustomDockablePane, CDockablePane)
    ON_WM_CREATE()
    ON_WM_SIZE()
    ON_WM_WINDOWPOSCHANGING()
    ON_WM_CONTEXTMENU()
    ON_WM_MOUSEACTIVATE()
    ON_MESSAGE(WM_HELPHITTEST, &CCustomDockablePane::OnHelpHitTest)
    ON_WM_SHOWWINDOW()
END_MESSAGE_MAP()
#pragma warning(pop)

//---------------------------------------------------------------------------
CCustomDockablePane::CCustomDockablePane(UINT uViewId) :
    CDockablePane(),
    m_view(NULL),
    m_resizeViewWithPane(false),
    m_pCharacter(NULL),
    m_document(NULL),
    m_viewId(uViewId),
    m_hIcon(0)
{
    m_hIcon = (HICON) ::LoadImage(
            ::AfxGetResourceHandle(),
            MAKEINTRESOURCE(m_viewId),
            IMAGE_ICON,
            ::GetSystemMetrics(SM_CXSMICON),
            ::GetSystemMetrics(SM_CYSMICON), 0);
    m_pTabbedControlBarRTC = RUNTIME_CLASS(CCustomTabbedPane);
    //m_pMiniFrameRTC = RUNTIME_CLASS(CCustomMultiPaneFrameWnd);
}

CCustomDockablePane::~CCustomDockablePane()
{
    DestroyIcon(m_hIcon);
}

//---------------------------------------------------------------------------
int CCustomDockablePane::OnCreate(LPCREATESTRUCT lpCreateStruct)
{
    m_pTabbedControlBarRTC = RUNTIME_CLASS(CCustomTabbedPane);
    //m_pMiniFrameRTC = RUNTIME_CLASS(CCustomMultiPaneFrameWnd);
    if (CDockablePane::OnCreate(lpCreateStruct) == -1)
    {
        return -1;
    }

    CCreateContext* createContext = (CCreateContext*)(lpCreateStruct->lpCreateParams);
    CRuntimeClass* viewRuntimeClass = createContext->m_pNewViewClass;

    CView* theView = (CView*)(viewRuntimeClass->CreateObject());

    CRect r;
    GetClientRect(r);
    theView->Create(
            0,
            0,
            WS_CHILD | WS_VISIBLE,
            r,
            this,
            0,
            createContext);
    SetView(theView, true);
    theView->SendMessage(WM_INITIALUPDATE, 0, 0);

    SetMinSize(CSize(30, 30));
    SetIcon(m_hIcon, FALSE);

    return 0;
}

//---------------------------------------------------------------------------
void CCustomDockablePane::SetView(CView* v, bool r)
{
    m_view = v;
    m_resizeViewWithPane = r;
}

void CCustomDockablePane::SetDocumentAndCharacter(
        CDocument* pDoc,
        Character* pCharacter)
{
    m_document = pDoc;
    m_pCharacter = pCharacter;
    m_view->SendMessage(UWM_NEW_DOCUMENT, (WPARAM)pDoc, (LPARAM)pCharacter);
}

//---------------------------------------------------------------------------
void CCustomDockablePane::OnSize(UINT nType, int cx, int cy)
{
    CDockablePane::OnSize(nType, cx, cy);
    AdjustLayout();
}

//---------------------------------------------------------------------------
void CCustomDockablePane::AdjustLayout()
{
    if (GetSafeHwnd())
    {
        // If we have a contained view, resize it as well
        if (m_view && m_resizeViewWithPane)
        {
            CRect r;
            GetClientRect(r);

            if (m_view->GetSafeHwnd()
                    && r.Height() > 0
                    && r.Width() > 0)
            {
                m_view->SetWindowPos(
                        this,
                        r.left,
                        r.top,
                        r.Width(),
                        r.Height(),
                        SWP_NOACTIVATE | SWP_NOZORDER);
            }
        }
    }
}

BOOL CCustomDockablePane::OnCmdMsg(
        UINT nID,
        int nCode,
        void* pExtra,
        AFX_CMDHANDLERINFO* pHandlerInfo)
{
    BOOL handled = false;

    if (IsWindow(m_view->GetSafeHwnd()))
    {
        handled = m_view->OnCmdMsg(nID, nCode, pExtra, pHandlerInfo);
    }

    if (!handled)
    {
        handled =  CDockablePane::OnCmdMsg(nID, nCode, pExtra, pHandlerInfo);
    }

    return handled;
}

void CCustomDockablePane::DrawCaption(CDC* pDC, CRect rectCaption)
{
    const int iconW = ::GetSystemMetrics(SM_CXSMICON);
    const int iconH = ::GetSystemMetrics(SM_CYSMICON);
    const BOOL bActive = IsActive();

    // Choose gradient colours based on active state:
    //   Active   → warm orange glow gradient
    //   Inactive → standard dark-red caption gradient
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

    // Draw the pane icon
    const int iconX = rectCaption.left + 2;
    const int iconY = rectCaption.top + (rectCaption.Height() - iconH) / 2;
    ::DrawIconEx(pDC->GetSafeHdc(), iconX, iconY,
            m_hIcon, iconW, iconH, 0, NULL, DI_NORMAL);

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

    // Title text and pin/close buttons
    pDC->SetBkMode(TRANSPARENT);
    pDC->SetTextColor(bActive ? CLR_DDO_GOLD_BRIGHT : CLR_DDO_TEXT_DIM);
    CRect rcText = rectCaption;
    rcText.left += iconW + 6;
    CDockablePane::DrawCaption(pDC, rcText);

    // Accent line along the full bottom edge – orange when active, gold otherwise
    COLORREF clrLine = bActive ? CLR_DDO_ORANGE : CLR_DDO_RED;
    CPen penLine(PS_SOLID, bActive ? 2 : 1, clrLine);
    pOld = pDC->SelectObject(&penLine);
    pDC->MoveTo(rectCaption.left,  rectCaption.bottom - 1);
    pDC->LineTo(rectCaption.right, rectCaption.bottom - 1);
    pDC->SelectObject(pOld);
}

CTabbedPane* CCustomDockablePane::CreateTabbedPane()
{
    m_pTabbedControlBarRTC = RUNTIME_CLASS(CCustomTabbedPane);
    CTabbedPane* pPane = CDockablePane::CreateTabbedPane();
    CCustomTabbedPane* pCustomPane = dynamic_cast<CCustomTabbedPane*>(pPane);
    if (pCustomPane != NULL)
    {
        pCustomPane->m_hIcon = m_hIcon;
    }
    return pPane;
}

void CCustomDockablePane::OnAfterChangeParent(CWnd* pWndOldParent)
{
    CDockablePane::OnAfterChangeParent(pWndOldParent);
}

void CCustomDockablePane::OnContextMenu(CWnd* pWnd, CPoint point)
{
    UNREFERENCED_PARAMETER(pWnd);
    UNREFERENCED_PARAMETER(point);
}

int CCustomDockablePane::OnMouseActivate(CWnd* pDesktopWnd, UINT nHitTest, UINT message)
{
    // this is required to stop an assert in CView::OnMouseActivate when a dockable
    // pane is set to floating mode.
    CFrameWnd* pParentFrame = GetParentFrame();

    if( (pParentFrame == pDesktopWnd) || 
        (pDesktopWnd->IsChild(pParentFrame)))
    {
        return CDockablePane::OnMouseActivate(pDesktopWnd, nHitTest, message);
    }

    return MA_NOACTIVATE;
}

void CCustomDockablePane::OnWindowPosChanging(WINDOWPOS* pos)
{
    // ensure tooltip locations are correct on window move
    CDockablePane::OnWindowPosChanging(pos);
    PostMessage(WM_SIZE, SIZE_RESTORED, MAKELONG(pos->cx, pos->cy));
}

LRESULT CCustomDockablePane::OnHelpHitTest(WPARAM, LPARAM)
{
    return 0x10000 + m_viewId;
}

void CCustomDockablePane::OnShowWindow(BOOL bShow, UINT nStatus)
{
    CDockablePane::OnShowWindow(bShow, nStatus);
    if (TRUE == bShow)
    {
        CRect rctWindow;
        GetClientRect(&rctWindow);
        m_view->PostMessage(WM_SIZE, SIZE_RESTORED, MAKELONG(rctWindow.Width(), rctWindow.Height()));
        m_view->Invalidate();
    }
}

