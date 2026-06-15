[Setup]
AppId={{FILLATOR-2077-DEMO}}
AppName=Fillator 2077
AppVersion=1.0
AppPublisher=Fillator 2077
DefaultDirName={localappdata}\Fillator 2077
DefaultGroupName=Fillator 2077
OutputDir=installer_output
OutputBaseFilename=Fillator2077_Setup
Compression=lzma
SolidCompression=yes
WizardStyle=modern
SetupIconFile=images\fillator_2077_installer_icon.ico
UninstallDisplayIcon={app}\BC_Launcher.exe

[Languages]
Name: "polish"; MessagesFile: "compiler:Languages\Polish.isl"

[Files]
Source: "demo_package\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autodesktop}\Fillator 2077"; Filename: "{app}\BC_Launcher.exe"; WorkingDir: "{app}"; IconFilename: "{app}\BC_Launcher.exe"
Name: "{group}\Fillator 2077"; Filename: "{app}\BC_Launcher.exe"; WorkingDir: "{app}"; IconFilename: "{app}\BC_Launcher.exe"

[Run]
Filename: "{app}\BC_Launcher.exe"; Description: "Uruchom Fillator 2077"; Flags: nowait postinstall skipifsilent