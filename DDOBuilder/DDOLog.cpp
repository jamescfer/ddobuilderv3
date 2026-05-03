// DDOLog.cpp – lightweight file logger for DDOBuilder.

#include "stdafx.h"
#include "DDOLog.h"
#include <stdio.h>
#include <time.h>
#include <stdarg.h>

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------
static FILE*            s_logFile       = nullptr;
static CRITICAL_SECTION s_cs;
static bool             s_csInit        = false;

// ---------------------------------------------------------------------------
// DDO_LogOpen
// ---------------------------------------------------------------------------
void DDO_LogOpen(const char* exeDir)
{
    InitializeCriticalSection(&s_cs);
    s_csInit = true;

    char path[MAX_PATH];
    _snprintf_s(path, _TRUNCATE, "%sDDOBuilder.log", exeDir ? exeDir : "");

    // Open for write (overwrite previous log on each run)
    fopen_s(&s_logFile, path, "w");
    if (!s_logFile)
        return;  // silently continue – log is a best-effort diagnostic tool

    // Header
    time_t now = time(nullptr);
    char timeBuf[64];
    ctime_s(timeBuf, sizeof(timeBuf), &now);
    // ctime appends '\n'; replace with '\0'
    char* nl = strchr(timeBuf, '\n');
    if (nl) *nl = '\0';

    fprintf(s_logFile,
        "=== DDOBuilder log opened %s ===\n"
        "    Build date : " __DATE__ " " __TIME__ "\n"
        "    Log path   : %s\n"
        "=============================================\n",
        timeBuf, path);
    fflush(s_logFile);
}

// ---------------------------------------------------------------------------
// DDO_LogClose
// ---------------------------------------------------------------------------
void DDO_LogClose()
{
    if (!s_logFile)
        return;

    EnterCriticalSection(&s_cs);
    fprintf(s_logFile, "=== DDOBuilder log closed ===\n");
    fclose(s_logFile);
    s_logFile = nullptr;
    LeaveCriticalSection(&s_cs);

    if (s_csInit)
    {
        DeleteCriticalSection(&s_cs);
        s_csInit = false;
    }
}

// ---------------------------------------------------------------------------
// DDO_LogWrite
// ---------------------------------------------------------------------------
void DDO_LogWrite(const char* level, const char* srcFile, int line, const char* fmt, ...)
{
    if (!s_logFile)
        return;

    // Build timestamp
    SYSTEMTIME st;
    GetLocalTime(&st);

    // Format the user message
    char msgBuf[2048];
    va_list ap;
    va_start(ap, fmt);
    _vsnprintf_s(msgBuf, _TRUNCATE, fmt, ap);
    va_end(ap);

    EnterCriticalSection(&s_cs);
    fprintf(s_logFile,
        "[%02d:%02d:%02d.%03d] %-5s %s(%d): %s\n",
        st.wHour, st.wMinute, st.wSecond, st.wMilliseconds,
        level, srcFile, line, msgBuf);
    fflush(s_logFile);
    LeaveCriticalSection(&s_cs);

    // Also send to VS output / DebugView
    char dbgBuf[2176];
    _snprintf_s(dbgBuf, _TRUNCATE,
        "[DDO %-5s] %s(%d): %s\n", level, srcFile, line, msgBuf);
    OutputDebugStringA(dbgBuf);
}
