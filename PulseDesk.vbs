' PulseDesk silent launcher.
'
' Double-clicking a .bat always flashes a console window and leaves it open for as long
' as the app runs. WScript.Shell.Run with the window style set to 0 starts the same
' command with no window at all, so PulseDesk appears on its own with nothing behind it.

Option Explicit

Dim shell, fso, here, cmd
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

here = fso.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = here

' First run needs dependencies. Installing them is slow, so say so rather than looking dead.
If Not fso.FolderExists(fso.BuildPath(here, "node_modules\electron")) Then
  If MsgBox("PulseDesk needs to download what it runs on." & vbCrLf & vbCrLf & _
            "This happens once and takes 2-5 minutes. Start now?", _
            vbOKCancel + vbInformation, "PulseDesk - first run") <> vbOK Then
    WScript.Quit
  End If
  ' Visible during install only, so progress and any error are readable.
  If shell.Run("cmd /c npm install", 1, True) <> 0 Then
    MsgBox "The download failed. Check your internet connection and try again.", vbCritical, "PulseDesk"
    WScript.Quit
  End If
End If

' Launch electron.exe directly rather than through npm/cmd: no shell is involved at all,
' so there is no console to hide and nothing can flash on screen.
Dim exe
exe = fso.BuildPath(here, "node_modules\electron\dist\electron.exe")
If Not fso.FileExists(exe) Then
  MsgBox "PulseDesk could not find Electron. Delete the node_modules folder and run this again.", vbCritical, "PulseDesk"
  WScript.Quit
End If

' 0 = hidden window, False = do not wait, so this script exits and leaves the app running.
cmd = """" & exe & """ """ & here & """"
shell.Run cmd, 0, False
