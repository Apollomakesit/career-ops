#requires -Version 5.1
<#
.SYNOPSIS
  One-command launcher for the fully-local Career Ops job dashboard.

.DESCRIPTION
  Starts everything needed to run the dashboard on this machine with no Railway
  dependency:
    * CLIProxyAPI        - local AI gateway (Anthropic / OpenAI accounts)
    * Dashboard server   - the web UI + API, backed by a local SQLite database
    * Runner control     - lets the dashboard start the Playwright runners
  Then it opens the dashboard in your browser. Re-running it is safe; services
  that are already up are left alone.
#>
param(
  [string]$CliProxyPath = "E:\Github Repos\CLIProxyAPI",
  [ValidateSet("openai", "anthropic")]
  [string]$AiProvider = "anthropic",
  [string]$AiModel = "",
  [int]$DashboardPort = 3000,
  [int]$CliProxyPort = 8317,
  [int]$ControlPort = 48731,
  [switch]$NoBrowser,
  [switch]$NoStart
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$AppDir = (Resolve-Path (Join-Path $ScriptDir "..")).Path
$RepoRoot = (Resolve-Path (Join-Path $AppDir "..\..")).Path
$ConfigPath = Join-Path $RepoRoot ".career-ops-runner.local.json"
$DashboardUrl = "http://127.0.0.1:$DashboardPort"

function Test-LocalPort {
  param([int]$Port)
  $client = [System.Net.Sockets.TcpClient]::new()
  try {
    $async = $client.BeginConnect("127.0.0.1", $Port, $null, $null)
    if ($async.AsyncWaitHandle.WaitOne(500, $false)) {
      $client.EndConnect($async)
      return $true
    }
    return $false
  } catch {
    return $false
  } finally {
    $client.Dispose()
  }
}

function Wait-ForPort {
  param([int]$Port, [int]$TimeoutSeconds = 20)
  for ($i = 0; $i -lt ($TimeoutSeconds * 2); $i++) {
    if (Test-LocalPort -Port $Port) { return $true }
    Start-Sleep -Milliseconds 500
  }
  return $false
}

function Resolve-CommandPath {
  param([string[]]$Names)
  foreach ($name in $Names) {
    $command = Get-Command $name -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }
  }
  return $Names[0]
}

function Get-CliProxyApiKey {
  param([string]$Path)
  $configFile = Join-Path $Path "config.yaml"
  if (-not (Test-Path $configFile)) {
    Write-Warning "CLIProxyAPI config.yaml was not found at $configFile."
    return ""
  }
  $text = Get-Content -Raw $configFile
  $match = [regex]::Match($text, '(?ms)api-keys:\s*(?:\r?\n\s*-\s*"?(?<key>[^"\r\n]+)"?)')
  if ($match.Success) { return $match.Groups["key"].Value.Trim() }
  Write-Warning "No api-keys entry found in CLIProxyAPI config.yaml."
  return ""
}

# --- Local runner config -----------------------------------------------------
$proxyKey = Get-CliProxyApiKey -Path $CliProxyPath
if (-not $AiModel) {
  $AiModel = if ($AiProvider -eq "openai") { "gpt-5.4-mini" } else { "SubscriptionGateway/claude-haiku-4-5-20251001" }
}

$config = [ordered]@{
  dashboardUrl   = $DashboardUrl
  dashboardToken = ""
  browserProfile = ".career-ops-browser"
  aiProvider     = $AiProvider
  aiBaseUrl      = "http://127.0.0.1:$CliProxyPort/api/provider/$AiProvider/v1"
  aiModel        = $AiModel
  aiProxyApiKey  = $proxyKey
  aiFitLimit     = "40"
  aiDraftMinFit  = "60"
  aiDraftLimit   = "20"
  cliProxyPath   = $CliProxyPath
}
$config | ConvertTo-Json -Depth 5 | Set-Content -Encoding UTF8 -Path $ConfigPath
Write-Host "Wrote local runner config: $ConfigPath"

# --- Start services ----------------------------------------------------------
if (-not $NoStart) {
  $node = Resolve-CommandPath @("node.exe", "node")
  $npm = Resolve-CommandPath @("npm.cmd", "npm")

  if ((Test-Path $CliProxyPath) -and -not (Test-LocalPort -Port $CliProxyPort)) {
    $go = Resolve-CommandPath @("go.exe", "go")
    Write-Host "Starting CLIProxyAPI on 127.0.0.1:$CliProxyPort..."
    Start-Process -FilePath $go -ArgumentList @("run", "./cmd/server") -WorkingDirectory $CliProxyPath -WindowStyle Hidden
  }

  if (-not (Test-LocalPort -Port $ControlPort)) {
    Write-Host "Starting runner control on 127.0.0.1:$ControlPort..."
    Start-Process -FilePath $npm -ArgumentList @("run", "runner:control") -WorkingDirectory $AppDir -WindowStyle Hidden
  }

  if (-not (Test-LocalPort -Port $DashboardPort)) {
    Write-Host "Starting dashboard server on $DashboardUrl..."
    # The dashboard uses SQLite when DATABASE_URL is unset and skips the access
    # token when DASHBOARD_TOKEN is unset - both intended for local use.
    $env:PORT = "$DashboardPort"
    $env:DATABASE_URL = ""
    $env:DASHBOARD_TOKEN = ""
    Start-Process -FilePath $node -ArgumentList @("src/server.mjs") -WorkingDirectory $AppDir -WindowStyle Hidden
  }

  if (-not (Wait-ForPort -Port $DashboardPort -TimeoutSeconds 25)) {
    Write-Warning "Dashboard did not come online on port $DashboardPort. Check for errors."
  }
}

# --- Status ------------------------------------------------------------------
$cliProxyStatus = if (Test-LocalPort -Port $CliProxyPort) { "online" } else { "offline" }
$controlStatus = if (Test-LocalPort -Port $ControlPort) { "online" } else { "offline" }
$dashboardStatus = if (Test-LocalPort -Port $DashboardPort) { "online" } else { "offline" }

Write-Host ""
Write-Host "==================== Career Ops (local) ===================="
Write-Host ("Dashboard      {0,-8} {1}" -f $dashboardStatus, $DashboardUrl)
Write-Host ("CLIProxyAPI    {0,-8} http://127.0.0.1:{1}" -f $cliProxyStatus, $CliProxyPort)
Write-Host ("Runner control {0,-8} http://127.0.0.1:{1}" -f $controlStatus, $ControlPort)
Write-Host ("AI provider    {0} / {1}" -f $AiProvider, $AiModel)
Write-Host "============================================================="
Write-Host ""

if (-not $NoBrowser -and $dashboardStatus -eq "online") {
  Start-Process $DashboardUrl
  Write-Host "Opened the dashboard in your browser. Everything is controlled from there."
} else {
  Write-Host "Open $DashboardUrl to use the dashboard."
}
