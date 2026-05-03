// AboutDlg.h
//
#include "Resource.h"
#include "DDODialog.h"

class CAboutDlg : public CDDODialogEx
{
public:
    CAboutDlg();

// Dialog Data
    enum { IDD = IDD_ABOUTBOX };

protected:
    virtual void DoDataExchange(CDataExchange* pDX);    // DDX/DDV support
    virtual BOOL OnInitDialog();

// Implementation
protected:
    DECLARE_MESSAGE_MAP()
    CStatic m_staticVersion;
    CEdit m_bugReporters;
};

