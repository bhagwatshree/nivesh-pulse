param([Parameter(Mandatory = $true)][string]$Path)

$excel = $null
$workbook = $null
try {
  $excel = New-Object -ComObject Excel.Application
  $excel.Visible = $false
  $excel.DisplayAlerts = $false
  $workbook = $excel.Workbooks.Open($Path, 0, $true)
  $result = @()
  foreach ($sheet in $workbook.Worksheets) {
    $used = $sheet.UsedRange
    $maxRows = [Math]::Min($used.Rows.Count, 40)
    $maxColumns = [Math]::Min($used.Columns.Count, 20)
    $rows = @()
    for ($row = 1; $row -le $maxRows; $row++) {
      $values = @()
      for ($column = 1; $column -le $maxColumns; $column++) {
        $values += $sheet.Cells.Item($row, $column).Text
      }
      $rows += ,$values
    }
    $result += [PSCustomObject]@{
      sheet = $sheet.Name
      rowCount = $used.Rows.Count
      columnCount = $used.Columns.Count
      rows = $rows
    }
  }
  $result | ConvertTo-Json -Depth 8
}
finally {
  if ($workbook) { $workbook.Close($false) }
  if ($excel) { $excel.Quit() }
  if ($workbook) { [Runtime.InteropServices.Marshal]::ReleaseComObject($workbook) | Out-Null }
  if ($excel) { [Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null }
}
