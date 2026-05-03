// DDOLog.h – lightweight file logger for DDOBuilder.
// Creates DDOBuilder.log next to the executable on every run.
// Thread-safe; safe to call from any thread after DDO_LogOpen().
#pragma once

// Opens (or creates) DDOBuilder.log in the same directory as the exe.
// Pass the full path to the exe directory (with trailing backslash).
// Call once, very early in InitInstance.
void DDO_LogOpen(const char* exeDir);

// Flushes and closes the log.  Call from ExitInstance.
void DDO_LogClose();

// Write a formatted, timestamped line.
// level : "INFO" | "WARN" | "ERROR"
// Do not call directly – use the macros below.
void DDO_LogWrite(const char* level, const char* srcFile, int line, const char* fmt, ...);

// ---------------------------------------------------------------------------
// Convenience macros – strip the full path down to filename only
// ---------------------------------------------------------------------------
#define _DDO_FNAME (strrchr(__FILE__, '\\') ? strrchr(__FILE__, '\\') + 1 : __FILE__)

#define LOG_INFO(...)  DDO_LogWrite("INFO",  _DDO_FNAME, __LINE__, __VA_ARGS__)
#define LOG_WARN(...)  DDO_LogWrite("WARN",  _DDO_FNAME, __LINE__, __VA_ARGS__)
#define LOG_ERROR(...) DDO_LogWrite("ERROR", _DDO_FNAME, __LINE__, __VA_ARGS__)
