!include /NONFATAL "${__FILEDIR__}\browser-native-host.generated.nsh"

!ifndef MORI_BROWSER_CHROME_EXTENSION_ID
  !define MORI_BROWSER_CHROME_EXTENSION_ID ""
!endif
!ifndef MORI_BROWSER_EDGE_EXTENSION_ID
  !define MORI_BROWSER_EDGE_EXTENSION_ID ""
!endif
!ifndef MORI_BROWSER_EXTENSION_IDS
  !define MORI_BROWSER_EXTENSION_IDS ""
!endif

!define MORI_BROWSER_HOST_NAME "com.swarea.mori.browser"
!define MORI_BROWSER_MANIFEST_PATH "$LOCALAPPDATA\Mori\NativeMessagingHosts\${MORI_BROWSER_HOST_NAME}.json"
!define MORI_BROWSER_INSTALL_SCRIPT "$INSTDIR\connectors\browser-native\install-native-host.ps1"
!define MORI_BROWSER_UNINSTALL_SCRIPT "$INSTDIR\connectors\browser-native\uninstall-native-host.ps1"
!define MORI_BROWSER_HOST_PATH "$INSTDIR\mori-browser-native-host.exe"
!define MORI_BROWSER_POWERSHELL "$SYSDIR\WindowsPowerShell\v1.0\powershell.exe"

!macro MORI_BROWSER_REGISTER BrowserName ExtensionId DoneLabel
  StrCmp "${ExtensionId}" "" ${DoneLabel}
  ExecWait '"${MORI_BROWSER_POWERSHELL}" -NoProfile -ExecutionPolicy Bypass -File "${MORI_BROWSER_INSTALL_SCRIPT}" -Browser "${BrowserName}" -HostPath "${MORI_BROWSER_HOST_PATH}" -ExtensionId "${MORI_BROWSER_EXTENSION_IDS}" -ManifestPath "${MORI_BROWSER_MANIFEST_PATH}"' $0
  IntCmp $0 0 ${DoneLabel} 0 0
  DetailPrint "Mori Browser Native Messaging registration failed for ${BrowserName}"
  Abort "Mori Browser Native Messaging registration failed."
  ${DoneLabel}:
!macroend

!macro MORI_BROWSER_UNREGISTER BrowserName DoneLabel
  IfFileExists "${MORI_BROWSER_UNINSTALL_SCRIPT}" 0 ${DoneLabel}
  ExecWait '"${MORI_BROWSER_POWERSHELL}" -NoProfile -ExecutionPolicy Bypass -File "${MORI_BROWSER_UNINSTALL_SCRIPT}" -Browser "${BrowserName}" -RemoveManifest -ManifestPath "${MORI_BROWSER_MANIFEST_PATH}" -ExpectedManifestPath "${MORI_BROWSER_MANIFEST_PATH}"' $0
  ${DoneLabel}:
!macroend

!macro NSIS_HOOK_POSTINSTALL
  !insertmacro MORI_BROWSER_REGISTER "chrome" "${MORI_BROWSER_CHROME_EXTENSION_ID}" mori_browser_chrome_done
  !insertmacro MORI_BROWSER_REGISTER "edge" "${MORI_BROWSER_EDGE_EXTENSION_ID}" mori_browser_edge_done
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  !insertmacro MORI_BROWSER_UNREGISTER "chrome" mori_browser_uninstall_chrome_done
  !insertmacro MORI_BROWSER_UNREGISTER "edge" mori_browser_uninstall_edge_done
!macroend
