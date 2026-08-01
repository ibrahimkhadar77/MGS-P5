# HSE Observation Dashboard Setup Guide

This document explains how this dashboard was built, what it needs to run, how the data source works, how to update or sync records, and how to create a similar dashboard.

It is written for users, so it focuses on practical steps instead of code details.

## 1) What This Dashboard Does

This is a browser-based HSE observation dashboard. It shows safety observations in a visual way so users can quickly review:

- Total observations and key KPIs
- Reporting trends over time
- Categories, severity, and hotspots
- People and designations that submitted reports
- Open items and aging items
- A full observation log with evidence links

The dashboard is a single-page web app built with plain HTML, CSS, and JavaScript.

## 2) What Files Make It Work

- [index.html](index.html) is the page layout. It contains the visible sections, tabs, filter controls, chart areas, log table, and pop-up windows.
- [assets/styles.css](assets/styles.css) contains the visual styling.
- [assets/app.js](assets/app.js) contains all dashboard behavior: loading data, cleaning data, filtering, charting, table rendering, pop-ups, and automatic refresh.
- [Safety Observation Report (Responses).xlsx](Safety%20Observation%20Report%20%28Responses%29.xlsx) is the workbook in the folder. It is useful as the original source reference or for preparation of data.

## 3) Technology Used

The dashboard uses the following tools and services:

- HTML for structure
- CSS for design
- JavaScript for logic
- PapaParse for reading CSV data
- Chart.js for charts and graphs
- Google Sheets as the live data source
- Google Apps Script as the primary live data endpoint
- Google Drive links for evidence previews

The page also loads Google Fonts from the internet for its appearance.

## 4) Prerequisites

Before using or setting up this dashboard, make sure you have:

- A modern browser such as Microsoft Edge, Google Chrome, or Firefox
- Internet access for the chart library, CSV parser, fonts, and Google services
- Access to the Google Sheet or Apps Script deployment that holds the observation data
- Permission to read the source spreadsheet if the data is private
- A static web folder containing [index.html](index.html), [assets/styles.css](assets/styles.css), and [assets/app.js](assets/app.js)

No software installation or build step is required for the dashboard itself.

## 5) How The Dashboard Is Built

The page is built in layers:

1. [index.html](index.html) creates the page shell.
2. [assets/styles.css](assets/styles.css) styles the dashboard.
3. [assets/app.js](assets/app.js) loads the data and turns it into filters, KPIs, charts, and a log table.
4. The script reads the source data, converts it into a common record format, and then renders the results.

The dashboard does not use a complex framework. That makes it easier to move, copy, or maintain.

## 6) Live Data Configuration

The live data connection is controlled inside [assets/app.js](assets/app.js).

### Current configuration values

- SHEET_ID: the Google Sheet identifier used for direct sheet export and Google visualization fallback.
- CSV_URL: direct CSV export URL built from the sheet ID.
- APPS_SCRIPT_URL: the Google Apps Script URL that returns data as JSON.
- DATA_SOURCE_MODE: selects the active source path.
- REFRESH_MS: automatic refresh interval, currently set to 5 minutes.
- PALETTE: the fixed chart color set.
- LOG_PAGE_SIZE: number of log rows shown per page in the table.

### Data source modes

- apps-script: uses the Apps Script endpoint first.
- direct-sheet: reads the Google Sheet CSV export directly.
- auto: tries Apps Script first, then falls back to the direct sheet export.

### Current active mode

The dashboard is currently configured to use direct-sheet mode.

When the dashboard is opened directly from a local file, it uses the Google Visualization fallback path automatically to avoid browser CORS restrictions on direct CSV fetch.

If Apps Script cannot be reached, the error screen tells the user to check:

- DATA_SOURCE_MODE
- Apps Script deployment access
- Google Sheet sharing permissions
- The sheet ID

## 7) How Data Is Read

The JavaScript file has three loading paths:

1. Apps Script JSON load
2. Direct CSV export from Google Sheet
3. Google Visualization fallback if the CSV export is blocked

After loading, the script converts the incoming data into one standard record shape. This keeps the dashboard stable even if the source column names vary slightly.

### Important parsing rule

Each record must have a location. If a row has no location, the dashboard skips it.

## 8) Required Data Fields

The dashboard expects the source sheet to contain these business fields:

- Date and time of observation
- Location of observation
- Observer name
- Type of observation
- What was specifically observed
- Category
- Immediate action taken
- Whether it was corrected on the spot
- Severity potential
- Photo or evidence or closeout link
- Responsible person
- Corrective action taken
- Observer designation
- Status

The script is flexible with header names. For example, it can accept both:

- Date and Time of Observation
- Timestamp

It also accepts slightly different versions of the location and observer fields.

### Recommended data quality rules

- Keep severity as a number from 1 to 5
- Keep status values readable, such as Open or Closed
- Keep evidence as one or more valid links
- Use one row per observation
- Keep location filled in for every record

## 9) How To Update or Sync Data

This dashboard is designed so users can update it by changing the source spreadsheet.

### To add new observations

1. Open the source spreadsheet.
2. Add a new row for each new observation.
3. Fill in the required fields.
4. Save the sheet.
5. Wait for the dashboard to refresh automatically, or reload the page manually.

### To correct or update existing observations

1. Find the existing row in the source spreadsheet.
2. Edit the values that need correction.
3. Save the spreadsheet.
4. Wait for the next refresh or reload the dashboard.

### Automatic sync behavior

The dashboard reloads live data every 5 minutes.

That means if the source data changes, the dashboard will pick up the change without a code update.

## 10) How To Set It Up From Scratch

If you want to create a similar dashboard, use this order:

1. Prepare your spreadsheet with one row per observation.
2. Make sure the spreadsheet includes the required fields listed above.
3. Put the dashboard files in a folder with the same structure.
4. Update SHEET_ID in [assets/app.js](assets/app.js) to the new Google Sheet ID.
5. Update APPS_SCRIPT_URL in [assets/app.js](assets/app.js) if you are using a different Apps Script deployment.
6. Choose the correct DATA_SOURCE_MODE.
7. Open [index.html](index.html) in a browser through a local web server or hosted site.

## 11) How The Data Load Fallback Works

The dashboard has a safe loading order:

1. If DATA_SOURCE_MODE is apps-script, it loads from the Apps Script endpoint.
2. If DATA_SOURCE_MODE is direct-sheet, it loads the CSV export.
3. If DATA_SOURCE_MODE is auto, it tries Apps Script first and then falls back to the direct sheet.

If loading fails and there are no records already in memory, the dashboard shows a banner message instead of breaking the page.

## 12) What Users Can Do In The Dashboard

The dashboard supports these user actions:

- Filter by observer name
- Filter by designation
- Filter by open or closed status
- Search across the observation text
- Click charts to filter the results
- Open a row to see the full report details
- Open evidence links or evidence previews
- Switch between overview, team, insights, trends, and log views

## 13) Evidence Link Handling

The dashboard can display evidence in two ways:

- As clickable links
- As preview images when the evidence link points to an image or a Google Drive file that can be previewed

If the evidence is not an image, the dashboard shows an open link instead.

## 14) If You Need To Build a Similar Dashboard

Use the same pattern if you want another dashboard for another project:

- Keep the page single-file friendly
- Use one script to normalize the data
- Keep the data source outside the page content
- Use charts only after the data is standardized
- Keep the source configuration in a few top constants
- Auto-refresh on a schedule instead of manual updates only

### Suggested reusable AI prompt

You can give the following prompt to an AI assistant if you want it to generate a similar dashboard:

Build a browser-based HSE observation dashboard using plain HTML, CSS, and JavaScript. Use PapaParse to read CSV data and Chart.js for charts. The dashboard must load live data from a Google Sheet through either a Google Apps Script JSON endpoint or a direct CSV export. Include a filter bar, KPI cards, trend chart, category chart, designation chart, severity chart, hotspot list, aging list, and a paged observation log table. Add modal pop-ups for full report details and evidence preview. Keep the design clean and professional, use Google Fonts, support automatic refresh every 5 minutes, and make the source configuration easy to change from a few top constants in the JavaScript file. The data should be normalized into a common record shape so the dashboard can accept slightly different source column names.

## 15) Troubleshooting

If the dashboard is not showing data, check the following:

- The Google Sheet ID is correct
- The Apps Script URL is correct
- The source sheet is shared or deployed correctly
- The browser has internet access
- The data rows include locations
- Severity values are numeric if you want severity charts to work as expected

If the page loads but shows a banner about live data being unavailable, the most likely issue is access to the sheet or Apps Script deployment.

If the log table is missing rows, the source data may have blank locations, because those rows are skipped.

## 16) Best Practice For Ongoing Maintenance

- Keep the source spreadsheet column names consistent
- Avoid changing the sheet structure unless you also update the parser rules in [assets/app.js](assets/app.js)
- Test the dashboard after changing the sheet or Apps Script endpoint
- Keep a backup copy of the spreadsheet before making major edits

## 17) Quick Summary

In simple terms, this dashboard works like this:

1. Data is stored in Google Sheets or provided by Apps Script.
2. The web page reads that data.
3. The script cleans and standardizes it.
4. Charts and tables are generated automatically.
5. The page refreshes every 5 minutes so the latest data appears without manual rebuilding.
