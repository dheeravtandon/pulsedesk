' PulseDesk launcher.
'
' This is the ONLY way the app should be started. It runs electron.exe directly through
' WScript.Shell with window style 0, so no console host is ever created - there is nothing
' to flash, nothing to minimise, and nothing left sitting in the taskbar behind the app.
'
' A .bat cannot do this: double-clicking one always creates a cmd window that lives for as
' long as the process it started, which is why the old run-pulsedesk.bat was removed.

Option Explicit

Dim shell, fso, here, exe, npmCmd
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

here = fso.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = here

exe = fso.BuildPath(here, "node_modules\electron\dist\electron.exe")

' First run needs dependencies. That download is slow and can fail, so it is the one step
' allowed to show a window - otherwise the app would just look dead for five minutes.
If Not fso.FileExists(exe) Then
  If MsgBox("PulseDesk needs to download what it runs on." & vbCrLf & vbCrLf & _
            "This happens once and takes 2-5 minutes. Start now?", _
            vbOKCancel + vbInformation, "PulseDesk - first run") <> vbOK Then
    WScript.Quit
  End If

  npmCmd = "cmd /c npm install"
  If shell.Run(npmCmd, 1, True) <> 0 Then
    MsgBox "The download failed." & vbCrLf & vbCrLf & _
           "Check your internet connection and run PulseDesk again.", vbCritical, "PulseDesk"
    WScript.Quit
  End If

  If Not fso.FileExists(exe) Then
    MsgBox "The download finished but Electron is missing." & vbCrLf & vbCrLf & _
           "Delete the node_modules folder and run PulseDesk again.", vbCritical, "PulseDesk"
    WScript.Quit
  End If
End If

' 0 = no window at all, False = do not wait, so this script exits immediately and leaves
' the app running on its own.
shell.Run """" & exe & """ """ & here & """", 0, False
