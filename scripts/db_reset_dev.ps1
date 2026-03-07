param(
  [switch]$Execute,
  [string]$DbHost = "127.0.0.1",
  [int]$DbPort = 54322,
  [string]$DbName = "postgres",
  [string]$DbUser = "postgres",
  [string]$DbPassword = "postgres",
  [string]$ComposeFile = ""
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Write-Step {
  param([string]$Message)
  Write-Host "[db-reset-dev] $Message" -ForegroundColor Cyan
}

function Resolve-RepoRoot {
  return Split-Path -Parent $PSScriptRoot
}

function Get-RuntimeInfo {
  param(
    [string]$RepoRoot,
    [string]$ComposeFileParam
  )

  $hasSupabase = [bool](Get-Command supabase -ErrorAction SilentlyContinue)
  $hasDocker = [bool](Get-Command docker -ErrorAction SilentlyContinue)
  $supabaseConfig = Join-Path $RepoRoot "supabase/config.toml"

  $composeCandidates = @()
  if ($ComposeFileParam) {
    $composeCandidates += (Join-Path $RepoRoot $ComposeFileParam)
  }
  $composeCandidates += @(
    (Join-Path $RepoRoot "docker-compose.yml"),
    (Join-Path $RepoRoot "docker-compose.yaml"),
    (Join-Path $RepoRoot "compose.yml"),
    (Join-Path $RepoRoot "compose.yaml")
  )
  $composeCandidates = @($composeCandidates | Where-Object { Test-Path $_ } | Select-Object -Unique)

  if ($hasSupabase -and (Test-Path $supabaseConfig)) {
    return @{
      Mode = "supabase-cli"
      SupabaseConfig = $supabaseConfig
      HasDocker = $hasDocker
    }
  }

  if ($hasDocker -and $composeCandidates.Count -gt 0) {
    return @{
      Mode = "docker-compose"
      ComposeFile = $composeCandidates[0]
      HasDocker = $hasDocker
    }
  }

  return @{
    Mode = "unknown"
    HasSupabase = $hasSupabase
    HasDocker = $hasDocker
    HasSupabaseConfig = (Test-Path $supabaseConfig)
    ComposeFile = if (@($composeCandidates).Count -gt 0) { $composeCandidates[0] } else { $null }
  }
}

function Get-SupabaseProjectId {
  param([string]$ConfigPath)
  if (-not (Test-Path $ConfigPath)) {
    return $null
  }
  $line = Get-Content $ConfigPath | Where-Object { $_ -match "^\s*project_id\s*=" } | Select-Object -First 1
  if (-not $line) {
    return $null
  }
  $parts = $line -split "=", 2
  if ($parts.Count -lt 2) {
    return $null
  }
  return ($parts[1].Trim().Trim("'").Trim('"'))
}

function Get-VolumeTargets {
  param([string]$ProjectId)

  $volumeNames = docker volume ls --format "{{.Name}}"
  if (-not $volumeNames) {
    return @()
  }

  if ($ProjectId) {
    return @($volumeNames | Where-Object { $_ -like "*$ProjectId*" })
  }

  return @($volumeNames | Where-Object { $_ -match "supabase" })
}

function Stop-LocalServices {
  param($Runtime)

  if ($Runtime.Mode -eq "supabase-cli") {
    Write-Step "Parando stack Supabase local (supabase stop)..."
    & supabase stop | Out-Host
    return
  }

  if ($Runtime.Mode -eq "docker-compose") {
    Write-Step "Parando stack docker compose..."
    & docker compose -f $Runtime.ComposeFile down --remove-orphans | Out-Host
    return
  }
}

function Remove-LocalData {
  param($Runtime)

  if ($Runtime.Mode -eq "docker-compose") {
    Write-Step "Removendo volumes da stack docker compose..."
    & docker compose -f $Runtime.ComposeFile down --volumes --remove-orphans | Out-Host
    return
  }

  if ($Runtime.Mode -eq "supabase-cli") {
    if (-not $Runtime.HasDocker) {
      throw "Docker nao encontrado. Nao foi possivel remover volumes do Supabase local."
    }
    $projectId = Get-SupabaseProjectId -ConfigPath $Runtime.SupabaseConfig
    $targets = Get-VolumeTargets -ProjectId $projectId
    if ($targets.Count -eq 0) {
      Write-Step "Nenhum volume encontrado para remocao."
      return
    }
    Write-Step "Removendo volumes: $($targets -join ', ')"
    foreach ($volume in $targets) {
      & docker volume rm -f $volume | Out-Host
    }
  }
}

function Start-LocalServices {
  param($Runtime)

  if ($Runtime.Mode -eq "supabase-cli") {
    Write-Step "Subindo stack Supabase local (supabase start)..."
    & supabase start | Out-Host
    return
  }

  if ($Runtime.Mode -eq "docker-compose") {
    Write-Step "Subindo stack docker compose..."
    & docker compose -f $Runtime.ComposeFile up -d | Out-Host
    return
  }
}

function Get-DbContainerName {
  param(
    [string]$ProjectId
  )

  $rows = docker ps --format "{{.Names}}|{{.Image}}"
  if (-not $rows) {
    return $null
  }

  $parsed = @()
  foreach ($row in $rows) {
    $parts = $row -split "\|", 2
    if ($parts.Count -lt 2) { continue }
    $parsed += [PSCustomObject]@{
      Name = $parts[0]
      Image = $parts[1]
    }
  }

  $dbCandidates = @($parsed | Where-Object {
    $_.Image -match "supabase/postgres" -or $_.Image -match "postgres"
  })
  if ($dbCandidates.Count -eq 0) {
    return $null
  }

  if ($ProjectId) {
    $projectMatch = @($dbCandidates | Where-Object { $_.Name -like "*$ProjectId*" })
    if ($projectMatch.Count -gt 0) {
      return $projectMatch[0].Name
    }
  }

  $supabaseName = @($dbCandidates | Where-Object { $_.Name -match "supabase" })
  if ($supabaseName.Count -gt 0) {
    return $supabaseName[0].Name
  }

  return $dbCandidates[0].Name
}

function Invoke-SqlFile {
  param(
    [string]$FilePath,
    [string]$DbContainer
  )

  if (-not (Test-Path $FilePath)) {
    throw "Arquivo SQL nao encontrado: $FilePath"
  }

  Write-Step "Aplicando SQL: $(Split-Path -Leaf $FilePath)"
  $temp = New-TemporaryFile
  try {
    Get-Content -Raw $FilePath | Set-Content -Path $temp -Encoding UTF8
    Invoke-SqlTempFile -TempFile $temp -DbContainer $DbContainer
  } finally {
    Remove-Item $temp -ErrorAction SilentlyContinue
  }
}

function Invoke-SqlTempFile {
  param(
    [string]$TempFile,
    [string]$DbContainer
  )

  $psql = Get-Command psql -ErrorAction SilentlyContinue
  if ($psql) {
    $env:PGPASSWORD = $DbPassword
    try {
      & psql -v ON_ERROR_STOP=1 -h $DbHost -p $DbPort -U $DbUser -d $DbName -f $TempFile | Out-Host
    } finally {
      Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    }
    return
  }

  if (-not $DbContainer) {
    throw "psql nao encontrado e container Postgres nao identificado."
  }

  Get-Content -Raw $TempFile | docker exec -i $DbContainer psql -v ON_ERROR_STOP=1 -U $DbUser -d $DbName | Out-Host
}

function Invoke-ValidationQuery {
  param(
    [string]$Title,
    [string]$Sql,
    [string]$DbContainer
  )

  Write-Step "Validacao: $Title"
  $temp = New-TemporaryFile
  try {
    $wrapped = @"
\pset footer off
\pset tuples_only off
$Sql
"@
    Set-Content -Path $temp -Value $wrapped -Encoding UTF8
    Invoke-SqlTempFile -TempFile $temp -DbContainer $DbContainer
  } finally {
    Remove-Item $temp -ErrorAction SilentlyContinue
  }
}

$repoRoot = Resolve-RepoRoot
$schemaFile = Join-Path $repoRoot "docs/supabase/schema.sql"
$migrationsDir = Join-Path $repoRoot "docs/supabase/migrations"
$migrationFiles = @(Get-ChildItem -Path $migrationsDir -Filter "*.sql" | Sort-Object Name)

if (-not (Test-Path $schemaFile)) {
  throw "Schema base nao encontrado em docs/supabase/schema.sql"
}

if ($migrationFiles.Count -eq 0) {
  throw "Nenhuma migration encontrada em docs/supabase/migrations"
}

$runtime = Get-RuntimeInfo -RepoRoot $repoRoot -ComposeFileParam $ComposeFile
Write-Step "Runtime detectado: $($runtime.Mode)"

if ($runtime.Mode -eq "unknown") {
  Write-Host ""
  Write-Host "Nao foi possivel detectar um runtime local para Supabase." -ForegroundColor Yellow
  Write-Host "Status detectado:" -ForegroundColor Yellow
  Write-Host "  - supabase CLI no PATH: $($runtime.HasSupabase)"
  Write-Host "  - docker no PATH: $($runtime.HasDocker)"
  Write-Host "  - supabase/config.toml: $($runtime.HasSupabaseConfig)"
  Write-Host "  - compose file detectado: $($runtime.ComposeFile)"
  Write-Host ""
  Write-Host "Instale/abra Docker + Supabase CLI e rode novamente." -ForegroundColor Yellow
  exit 1
}

$projectId = $null
if ($runtime.Mode -eq "supabase-cli") {
  $projectId = Get-SupabaseProjectId -ConfigPath $runtime.SupabaseConfig
}

$dbContainer = $null
if ($runtime.HasDocker) {
  $dbContainer = Get-DbContainerName -ProjectId $projectId
}

Write-Step "Plano DEV:"
Write-Host "  1) stop services"
Write-Host "  2) remove local postgres data/volumes"
Write-Host "  3) start services"
Write-Host "  4) apply docs/supabase/schema.sql"
Write-Host "  5) apply docs/supabase/migrations/*.sql (ordem numerica)"
Write-Host "  6) run SQL validations"
Write-Host ""

if (-not $Execute) {
  Write-Host "Dry-run concluido. Execute com -Execute para aplicar de fato." -ForegroundColor Yellow
  exit 0
}

Set-Location $repoRoot
Stop-LocalServices -Runtime $runtime
Remove-LocalData -Runtime $runtime
Start-LocalServices -Runtime $runtime

if (-not $dbContainer -and $runtime.HasDocker) {
  $dbContainer = Get-DbContainerName -ProjectId $projectId
}

Invoke-SqlFile -FilePath $schemaFile -DbContainer $dbContainer
foreach ($migration in $migrationFiles) {
  Invoke-SqlFile -FilePath $migration.FullName -DbContainer $dbContainer
}

Invoke-ValidationQuery -Title "View stock_overview (shape atual)" -DbContainer $dbContainer -Sql @"
select ordinal_position, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'stock_overview'
order by ordinal_position;
"@

Invoke-ValidationQuery -Title "RLS habilitado nas tabelas criticas" -DbContainer $dbContainer -Sql @"
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'users_profile',
    'suppliers',
    'products',
    'product_skus',
    'stock_movements',
    'sales',
    'sale_items',
    'sale_payments',
    'payment_methods',
    'card_brands',
    'label_print_jobs'
  )
order by tablename;
"@

Invoke-ValidationQuery -Title "Policies aplicadas" -DbContainer $dbContainer -Sql @"
select schemaname, tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in (
    'users_profile',
    'suppliers',
    'products',
    'product_skus',
    'stock_movements',
    'sales',
    'sale_items',
    'sale_payments',
    'payment_methods',
    'card_brands',
    'label_print_jobs'
  )
order by tablename, policyname;
"@

Invoke-ValidationQuery -Title "Funcoes criticas" -DbContainer $dbContainer -Sql @"
select n.nspname as schema_name, p.proname as function_name, p.prosecdef as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'handle_new_user',
    'prevent_role_escalation',
    'apply_stock_movement',
    'finalize_sale'
  )
order by p.proname;
"@

Invoke-ValidationQuery -Title "Triggers criticos" -DbContainer $dbContainer -Sql @"
select n.nspname as schema_name,
       c.relname as table_name,
       t.tgname as trigger_name,
       pg_get_triggerdef(t.oid) as trigger_def
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where not t.tgisinternal
  and (
    (n.nspname = 'public' and t.tgname in ('users_profile_role_guard', 'stock_movement_trigger'))
    or (n.nspname = 'auth' and t.tgname = 'on_auth_user_created')
  )
order by schema_name, table_name, trigger_name;
"@

Write-Step "Reset DEV finalizado com sucesso."
