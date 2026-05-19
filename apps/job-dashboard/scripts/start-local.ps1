param(
  [string]$DashboardUrl = "https://job-dashboard-production-0773.up.railway.app",
  [string]$CliProxyPath = "E:\Github Repos\CLIProxyAPI",
  [ValidateSet("openai", "anthropic")]
  [string]$AiProvider = "anthropic",
  [string]$AiModel = "",
  [int]$CliProxyPort = 8317,
  [int]$LocalRunnerPort = 48731,
  [switch]$NoStart
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$AppDir = Resolve-Path (Join-Path $ScriptDir "..")
$RepoRoot = Resolve-Path (Join-Path $AppDir "..\..")
$ConfigPath = Join-Path $RepoRoot ".career-ops-runner.local.json"

function Test-LocalPort {
  param([int]$Port)

  $client = [System.Net.Sockets.TcpClient]::new()
  try {
    $async = $client.BeginConnect("127.0.0.1", $Port, $null, $null)
    $connected = $async.AsyncWaitHandle.WaitOne(500, $false)
    if ($connected) {
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

function Get-DashboardToken {
  if ($env:DASHBOARD_TOKEN) {
    return $env:DASHBOARD_TOKEN
  }

  try {
    $variables = railway variable list --service job-dashboard --json | ConvertFrom-Json
    if ($variables.DASHBOARD_TOKEN) {
      return $variables.DASHBOARD_TOKEN
    }
  } catch {
    Write-Warning "Could not read DASHBOARD_TOKEN from Railway. You can paste it in the dashboard Operations tab later."
  }

  return ""
}

function Get-CliProxyApiKey {
  param([string]$Path)

  if ($env:AI_PROXY_API_KEY) {
    return $env:AI_PROXY_API_KEY
  }

  $configFile = Join-Path $Path "config.yaml"
  if (-not (Test-Path $configFile)) {
    Write-Warning "CLIProxyAPI config.yaml was not found at $configFile."
    return ""
  }

  $text = Get-Content -Raw $configFile
  $match = [regex]::Match($text, '(?ms)api-keys:\s*(?:\r?\n\s*-\s*"?(?<key>[^"\r\n]+)"?)')
  if ($match.Success) {
    return $match.Groups["key"].Value.Trim()
  }

  Write-Warning "No api-keys entry found in CLIProxyAPI config.yaml."
  return ""
}

function Resolve-CommandPath {
  param([string[]]$Names)

  foreach ($name in $Names) {
    $command = Get-Command $name -ErrorAction SilentlyContinue
    if ($command) {
      return $command.Source
    }
  }
  return $Names[0]
}

$dashboardToken = Get-DashboardToken
$proxyKey = Get-CliProxyApiKey -Path $CliProxyPath
$baseUrl = "http://127.0.0.1:$CliProxyPort/api/provider/$AiProvider/v1"
if (-not $AiModel) {
  if ($AiProvider -eq "openai") {
    $AiModel = "gpt-5.4-mini"
  } else {
    $AiModel = "SubscriptionGateway/claude-haiku-4-5-20251001"
  }
}

$config = [ordered]@{
  dashboardUrl = $DashboardUrl
  dashboardToken = $dashboardToken
  browserProfile = ".career-ops-browser"
  aiProvider = $AiProvider
  aiBaseUrl = $baseUrl
  aiModel = $AiModel
  aiProxyApiKey = $proxyKey
  aiFitLimit = "40"
  aiDraftMinFit = "60"
  aiDraftLimit = "20"
}

$config | ConvertTo-Json -Depth 5 | Set-Content -Encoding UTF8 -Path $ConfigPath
Write-Host "Wrote local runner config: $ConfigPath"

if (-not $NoStart) {
  if ((Test-Path $CliProxyPath) -and -not (Test-LocalPort -Port $CliProxyPort)) {
    $go = Resolve-CommandPath @("go.exe", "go")
    Write-Host "Starting CLIProxyAPI on 127.0.0.1:$CliProxyPort..."
    Start-Process -FilePath $go -ArgumentList @("run", "./cmd/server") -WorkingDirectory $CliProxyPath -WindowStyle Hidden
    Start-Sleep -Seconds 4
  }

  if (-not (Test-LocalPort -Port $LocalRunnerPort)) {
    $npm = Resolve-CommandPath @("npm.cmd", "npm")
    Write-Host "Starting Career Ops local runner on 127.0.0.1:$LocalRunnerPort..."
    Start-Process -FilePath $npm -ArgumentList @("run", "runner:control", "--prefix", "apps/job-dashboard") -WorkingDirectory $RepoRoot -WindowStyle Hidden
    Start-Sleep -Seconds 3
  }
}

$cliProxyStatus = if (Test-LocalPort -Port $CliProxyPort) { "online" } else { "offline" }
$runnerStatus = if (Test-LocalPort -Port $LocalRunnerPort) { "online" } else { "offline" }

Write-Host ""
Write-Host "Career Ops local setup"
Write-Host "Dashboard:     $DashboardUrl"
Write-Host "CLIProxyAPI:   $cliProxyStatus at http://127.0.0.1:$CliProxyPort"
Write-Host "Local runner:  $runnerStatus at http://127.0.0.1:$LocalRunnerPort"
Write-Host "AI provider:   $AiProvider"
Write-Host "AI model:      $AiModel"
Write-Host ""
Write-Host "Next: open the dashboard, go to Operations, click Check Local Runner, then Find Jobs."
