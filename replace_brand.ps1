$files = Get-ChildItem -Recurse -Include "*.jsx","*.js","*.html","*.dart","*.xml","*.md","*.conf","*.yaml","*.yml" -Path "e:\salon_v1" | Where-Object { $_.FullName -notmatch "node_modules|\\build\\" }
$c = 0
foreach ($f in $files) {
    $t = [System.IO.File]::ReadAllText($f.FullName)
    if ($t -match "Zane Salon|ZANE SALON") {
        $n = $t -replace "ZANE SALON", "HEXA SALON" -replace "Zane Salon", "Hexa Salon"
        [System.IO.File]::WriteAllText($f.FullName, $n)
        $c++
        Write-Host "Updated: $($f.Name)"
    }
}
Write-Host "Done: $c files updated"
