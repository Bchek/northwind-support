# Deploys the "existing" Northwind order platform to AWS (us-east-1).
#   ./aws/deploy.ps1                 # stack + code + seed
#   ./aws/deploy.ps1 -SkipSeed       # stack + code only
# Tear down:  aws cloudformation delete-stack --stack-name northwind-order-platform
param(
  [string]$VercelTeamSlug = "bharath-5299",
  [string]$Region = "us-east-1",
  [switch]$SkipSeed
)
$ErrorActionPreference = "Stop"
$stack = "northwind-order-platform"
$here = $PSScriptRoot
$tmp = Join-Path $env:TEMP "northwind-deploy"
New-Item -ItemType Directory -Force $tmp | Out-Null

Write-Host "1/3 CloudFormation stack ($stack)..."
aws cloudformation deploy --region $Region --stack-name $stack `
  --template-file "$here/template.yaml" `
  --capabilities CAPABILITY_NAMED_IAM `
  --parameter-overrides "VercelTeamSlug=$VercelTeamSlug" `
  --no-fail-on-empty-changeset
if ($LASTEXITCODE) { throw "stack deploy failed" }

Write-Host "2/3 Lambda code..."
$zip = Join-Path $tmp "lambda.zip"
Remove-Item $zip -ErrorAction SilentlyContinue
Compress-Archive -Path "$here/lambda/*" -DestinationPath $zip
aws lambda update-function-code --region $Region --function-name northwind-order-api `
  --zip-file "fileb://$zip" --output text --query LastUpdateStatus | Out-Null
if ($LASTEXITCODE) { throw "code upload failed" }
aws lambda wait function-updated --region $Region --function-name northwind-order-api

if (-not $SkipSeed) {
  Write-Host "3/3 Seeding orders..."
  $seed = Join-Path $tmp "seed.json"
  node "$here/seed/generate.mjs" $seed
  aws dynamodb batch-write-item --region $Region --request-items "file://$seed" | Out-Null
  if ($LASTEXITCODE) { throw "seed failed" }
}

aws cloudformation describe-stacks --region $Region --stack-name $stack `
  --query "Stacks[0].Outputs" --output table
