[CmdletBinding(SupportsShouldProcess = $true)]
param([Parameter(Mandatory = $true)][string]$ProjectRoot)
$ErrorActionPreference = 'Stop'
$manager = Join-Path $PSScriptRoot 'scripts\manage-install.cjs'
if ($PSCmdlet.ShouldProcess($ProjectRoot, 'Remove unchanged project-local Codex gate files')) {
    & node $manager uninstall $ProjectRoot
} else {
    & node $manager uninstall $ProjectRoot --what-if
}
if ($LASTEXITCODE -ne 0) { throw 'Gate removal failed. Review the diagnostic above.' }
