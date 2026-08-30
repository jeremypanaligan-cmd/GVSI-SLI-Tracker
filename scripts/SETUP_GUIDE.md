# GVSI SLI Tracker - Automated Database Setup

## Sheet Structure

| Sheet Name | Purpose |
|-----------|---------|
| **FIBERX NEW REPORT** | Original daily data entry (source of truth) |
| **RAW DATA** | Professional data sheet (imported from FIBERX) |
| **MTD** | Month-to-Date summary report (auto-generated) |

## Setup Steps

### Step 1: Create MTD Sheet
1. Open your Google Sheet
2. Click **+** (Add Sheet) at the bottom
3. Rename it to **MTD** (exact name)

### Step 2: Install Apps Script
1. Go to **Extensions → Apps Script**
2. Delete any existing code in `Code.gs`
3. Copy all code from `scripts/MTD.gs` and paste it
4. Click **Save** (💾)

### Step 3: First Run
1. Reload the spreadsheet (F5)
2. You'll see a new menu: **🚀 GVSI Auto-DB**
3. Click **🚀 GVSI Auto-DB → Import FIBERX to RAW DATA**
4. Grant permissions when prompted
5. Wait for the import to complete
6. Click **🚀 GVSI Auto-DB → Generate MTD Report**

### Step 4: Setup Auto-Trigger (Optional)
1. Click **🚀 GVSI Auto-DB → Setup Auto-Trigger**
2. Data will now auto-sync whenever you edit FIBERX NEW REPORT

## Column Mapping

### FIBERX NEW REPORT → RAW DATA

| RAW DATA Column | FIBERX Source |
|----------------|---------------|
| AREA | AREA (same) |
| FROM RJO | *(blank - not in FIBERX)* |
| BF | BF |
| INC | INC |
| Total Jo | TOTAL |
| TOTAL COMPLETED | FROM TOTAL + FROM RJO |
| RJO | RJO |
| Carry Over | CARRY OVER |
| MTD | MTD |
| TARGET | TARGET |
| % | % |

## MTD Report Columns

| Column | Description |
|--------|-------------|
| AREA | Province name |
| TOTAL BF | Sum of all daily BF for the month |
| TOTAL INC | Sum of all daily INC for the month |
| TOTAL JO | Sum of all daily Total Jo for the month |
| TOTAL COMPLETED | Sum of all daily completions for the month |
| TOTAL RJO | Sum of all daily RJO for the month |
| LAST CARRY OVER | Carry Over from last day of month |
| LAST MTD | MTD value from last day of month |
| TARGET | Monthly target |
| LAST % | Achievement % from last day of month |

## Custom Menu Functions

| Function | Description |
|----------|-------------|
| **Import FIBERX to RAW DATA** | Convert and append FIBERX data to RAW DATA |
| **Generate MTD Report** | Recalculate MTD from all RAW DATA |
| **Full Sync** | Run both import and MTD generation |
| **Setup Auto-Trigger** | Install edit trigger for auto-sync |
