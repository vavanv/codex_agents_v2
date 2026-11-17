[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [Parameter(Mandatory = $true)][string]$ProjectRoot,
    [string]$MvpRoot = $PSScriptRoot
)
$ErrorActionPreference = 'Stop'
$manager = Join-Path $MvpRoot 'scripts\manage-install.cjs'
if ($PSCmdlet.ShouldProcess($ProjectRoot, 'Install project-local Codex gate')) {
    & node $manager install $ProjectRoot
} else {
    & node $manager install $ProjectRoot --what-if
}
if ($LASTEXITCODE -ne 0) { throw 'Gate installation failed. Review the diagnostic above.' }
