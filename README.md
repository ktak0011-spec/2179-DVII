# Melbourne Public Transport Access

This is a Vega-Lite draft for the FIT2179 Data Visualisation 2 topic:

**Is Melbourne's Public Transport Keeping Up With Its People?**

The current page combines:

- ABS SA2 Regional Population 2024-25 data for Greater Melbourne.
- PTV / Transport Victoria GTFS Schedule stop locations.
- 10 Vega-Lite visualisation idioms, including one geographic map.

## Files

- `index.html` - the web page to open in VS Code Live Server or any local static server.
- `specs/01_access_map.vg.json` to `specs/10_density_histogram.vg.json` - readable Vega-Lite specifications.
- `data/` - cleaned chart data, kept under a few hundred KB for GitHub Pages.
- `scripts/build_dataset.py` - reproducible cleaner that reads the raw downloaded files.
- `raw/` - downloaded source files. These are large and do not need to be committed unless your tutor asks for raw sources.

## Run locally

From this folder:

```powershell
& 'C:\Users\User\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

In VS Code, the Live Server extension also works.

## Rebuild the cleaned CSV

```powershell
& 'C:\Users\User\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' scripts\build_dataset.py
```

## Data notes

The cleaner spatially assigns GTFS stops to ABS Greater Melbourne SA2 polygons using point-in-polygon matching. Train stops are grouped by `parent_station` when available so platforms are not treated as separate stations.

The 10 idioms are:

1. Choropleth map
2. Bubble scatter plot
3. Ranked horizontal bar chart
4. Growth ranking bar chart
5. Small-multiple donut chart
6. Heatmap
7. Multi-line chart
8. Summary dot plot
9. Mode dot plot
10. Histogram
