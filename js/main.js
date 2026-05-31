const charts = [
  {target: "#chart-scatter", spec: "specs/02_access_scatter.vg.json", builder: buildScatterSpec},
  {target: "#chart-low-access", spec: "specs/03_low_access_bar.vg.json", builder: buildLowAccessSpec},
  {target: "#chart-growth", spec: "specs/04_growth_access_bar.vg.json", builder: buildGrowthSpec},
  {target: "#chart-mode-stack", spec: "specs/05_mode_stacked_bar.vg.json", areaField: "area_band"},
  {target: "#chart-heatmap", spec: "specs/06_access_heatmap.vg.json", builder: buildHeatmapSpec},
  {target: "#chart-lines", spec: "specs/07_population_lines.vg.json", builder: buildLinesSpec},
  {target: "#chart-area-dot", spec: "specs/08_area_summary_dot.vg.json", builder: buildAreaSummarySpec},
  {target: "#chart-mode-dot", spec: "specs/09_mode_dotplot.vg.json", areaField: "area_band"},
  {target: "#chart-density", spec: "specs/10_density_histogram.vg.json", builder: buildDensitySpec}
];

const modeOptions = {
  all: {
    label: "all public transport stops",
    axis: "All stops per 10,000 residents",
    stops: "datum.total_stops",
    domain: [0, 180],
    ticks: [0, 20, 40, 60, 80, 100, 120, 140, 160, 180]
  },
  train: {
    label: "train stops only",
    axis: "Train stops per 10,000 residents",
    stops: "datum.train_stops",
    domain: [0, 5],
    ticks: [0, 1, 2, 3, 4, 5]
  },
  tram: {
    label: "tram stops only",
    axis: "Tram stops per 10,000 residents",
    stops: "datum.tram_stops",
    domain: [0, 70],
    ticks: [0, 10, 20, 30, 40, 50, 60, 70]
  },
  bus: {
    label: "bus/coach stops only",
    axis: "Bus/coach stops per 10,000 residents",
    stops: "datum.bus_stops",
    domain: [0, 170],
    ticks: [0, 20, 40, 60, 80, 100, 120, 160]
  }
};

const state = {
  area: "All",
  mode: "all"
};

const tourSteps = [
  {
    label: "Overview",
    area: "All",
    mode: "all"
  },
  {
    label: "Outer pressure",
    area: "Outer / growth corridor",
    mode: "all"
  },
  {
    label: "Bus reliance",
    area: "Outer / growth corridor",
    mode: "bus"
  },
  {
    label: "Inner contrast",
    area: "Inner Melbourne",
    mode: "tram"
  }
];

const views = new Map();
const specCache = new Map();
let accessRowsPromise = null;
let activeTourStep = 0;
let tourTimer = null;
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const embedOptions = {
  actions: {
    export: true,
    source: true,
    compiled: false,
    editor: true
  },
  renderer: "svg"
};

function metricExpression() {
  return `datum.population_2025 > 0 ? (${modeOptions[state.mode].stops}) / datum.population_2025 * 10000 : 0`;
}

function parseCsv(text) {
  const rows = [];
  let cell = "";
  let row = [];
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(cell);
      if (row.some((value) => value !== "")) {
        rows.push(row);
      }
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

async function getAccessRows() {
  if (!accessRowsPromise) {
    accessRowsPromise = fetch("data/melbourne_access.csv")
      .then((response) => response.text())
      .then((text) => {
        const [headers, ...rows] = parseCsv(text);
        return rows.map((values) => {
          const row = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
          [
            "population_2025",
            "population_growth_pct_2024_25",
            "train_stops",
            "tram_stops",
            "bus_stops",
            "total_stops"
          ].forEach((field) => {
            row[field] = toNumber(row[field]);
          });
          return row;
        });
      });
  }
  return accessRowsPromise;
}

function metricForRow(row) {
  const stopsByMode = {
    all: row.total_stops,
    train: row.train_stops,
    tram: row.tram_stops,
    bus: row.bus_stops
  };
  return row.population_2025 > 0 ? (stopsByMode[state.mode] / row.population_2025) * 10000 : 0;
}

function median(values) {
  if (!values.length) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function formatCompact(value) {
  return Intl.NumberFormat("en-AU", {notation: "compact", maximumFractionDigits: 1}).format(value);
}

function animateMetric(element, target, formatter) {
  const previous = Number(element.dataset.value);
  element.dataset.value = String(target);

  if (reduceMotion || !Number.isFinite(previous)) {
    element.textContent = formatter(target);
    return;
  }

  element.classList.remove("is-changing");
  void element.offsetWidth;
  element.classList.add("is-changing");

  const duration = 650;
  const start = performance.now();
  const tick = (now) => {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    element.textContent = formatter(previous + (target - previous) * eased);
    if (progress < 1) {
      requestAnimationFrame(tick);
    } else {
      element.textContent = formatter(target);
    }
  };

  requestAnimationFrame(tick);
}

function areaFilter(field = "area_band") {
  return state.area === "All" ? null : `datum.${field} == '${state.area}'`;
}

function accessCategoryExpression(field = "datum.access_metric") {
  return `${field} < 10 ? 'Very low' : ${field} < 20 ? 'Low' : ${field} < 45 ? 'Moderate' : 'High'`;
}

function areaTransform(field = "area_band") {
  const filter = areaFilter(field);
  return filter ? [{filter}] : [];
}

function metricTransforms() {
  return [
    {calculate: metricExpression(), as: "access_metric"},
    {calculate: accessCategoryExpression(), as: "dynamic_access_category"},
    {
      calculate: "datum.access_metric < 20 && datum.population_growth_pct_2024_25 >= 6 ? 'Rapid growth + low access' : datum.access_metric < 20 ? 'Low access' : 'Other SA2 areas'",
      as: "risk_group"
    }
  ];
}

function positiveMetricTransform() {
  return state.mode === "all" ? [] : [{filter: "datum.access_metric > 0"}];
}

function withAreaFilter(spec, field = "area_band") {
  const filter = areaFilter(field);
  if (!filter) {
    return spec;
  }
  const cloned = structuredClone(spec);
  cloned.transform = [{filter}, ...(cloned.transform || [])];
  return cloned;
}

function baseConfig(legendOrient = "right") {
  return {
    view: {stroke: null},
    axis: {
      gridColor: "#dfe5e3",
      labelColor: "#4b5658",
      titleColor: "#293233"
    },
    legend: {
      labelColor: "#293233",
      titleColor: "#293233",
      orient: legendOrient
    }
  };
}

function labelledTooltip() {
  return [
    {field: "sa2_name", title: "SA2"},
    {field: "area_band", title: "Area type"},
    {field: "population_2025", title: "Population", format: ",.0f"},
    {field: "population_growth_pct_2024_25", title: "Growth 2024-25", format: ".1f"},
    {field: "access_metric", title: modeOptions[state.mode].axis, format: ".2f"}
  ];
}

function buildScatterSpec() {
  return {
    $schema: "https://vega.github.io/schema/vega-lite/v5.json",
    description: "Interactive scatter plot of population density versus selected public transport access metric.",
    width: "container",
    height: 360,
    background: "transparent",
    data: {url: "data/melbourne_access.csv"},
    transform: [
      {filter: "datum.population_2025 >= 3000 && datum.total_stops > 0"},
      ...areaTransform(),
      {calculate: "datum.population_density_2025 / 1000", as: "density_thousands"},
      ...metricTransforms()
    ],
    layer: [
      {
        mark: {type: "rect", fill: "#fff2ef", stroke: "#e0b7af", strokeDash: [4, 4], opacity: 0.65},
        encoding: {x: {datum: 0.01}, x2: {datum: 45}, y: {datum: 0.01}, y2: {datum: 20}}
      },
      {
        data: {values: [{density_thousands: 26, access_metric: 17, label: "Low-access zone"}]},
        mark: {type: "text", align: "right", baseline: "middle", fontSize: 13, fontWeight: 700, color: "#8d3b33"},
        encoding: {
          x: {field: "density_thousands", type: "quantitative"},
          y: {field: "access_metric", type: "quantitative"},
          text: {field: "label"}
        }
      },
      {
        mark: {type: "circle", filled: true, size: 42, stroke: "#ffffff", strokeWidth: 0.35, opacity: 0.62},
        encoding: {
          x: {
            field: "density_thousands",
            type: "quantitative",
            title: "Population density, 2025 (thousand residents per km2)",
            scale: {type: "symlog", constant: 1, domain: [0, 45]},
            axis: {values: [0, 5, 10, 15, 20, 25, 30, 35, 40]}
          },
          y: {
            field: "access_metric",
            type: "quantitative",
            title: modeOptions[state.mode].axis,
            scale: {type: "symlog", constant: 1, domain: modeOptions[state.mode].domain},
            axis: {values: modeOptions[state.mode].ticks}
          },
          color: {
            field: "risk_group",
            type: "nominal",
            title: "Access risk",
            scale: {
              domain: ["Rapid growth + low access", "Low access", "Other SA2 areas"],
              range: ["#b45145", "#e2a43a", "#98aaa6"]
            }
          },
          tooltip: [
            {field: "sa2_name", title: "SA2"},
            {field: "area_band", title: "Area type"},
            {field: "population_2025", title: "Population", format: ",.0f"},
            {field: "population_density_2025", title: "Density per km2", format: ",.1f"},
            {field: "population_growth_pct_2024_25", title: "Growth 2024-25", format: ".1f"},
            {field: "access_metric", title: modeOptions[state.mode].axis, format: ".2f"}
          ]
        }
      },
      {
        transform: [{filter: "datum.access_metric < 20 && datum.population_growth_pct_2024_25 >= 6"}],
        mark: {type: "circle", filled: false, size: 170, stroke: "#1f292b", strokeWidth: 1.3, opacity: 0.9},
        encoding: {
          x: {field: "density_thousands", type: "quantitative", scale: {type: "symlog", constant: 1, domain: [0, 45]}},
          y: {field: "access_metric", type: "quantitative", scale: {type: "symlog", constant: 1, domain: modeOptions[state.mode].domain}},
          tooltip: labelledTooltip()
        }
      }
    ],
    config: baseConfig("bottom")
  };
}

function buildLowAccessSpec() {
  return {
    $schema: "https://vega.github.io/schema/vega-lite/v5.json",
    description: "Interactive ranking of lowest-access SA2 areas.",
    width: "container",
    height: 300,
    background: "transparent",
    data: {url: "data/melbourne_access.csv"},
    transform: [
      {filter: "datum.population_2025 >= 3000"},
      ...areaTransform(),
      ...metricTransforms(),
      ...positiveMetricTransform(),
      {
        calculate: "datum.population_growth_pct_2024_25 >= 6 ? 'Rapid growth warning' : datum.growth_category",
        as: "bar_group"
      },
      {
        window: [{op: "row_number", as: "access_rank"}],
        sort: [
          {field: "access_metric", order: "ascending"},
          {field: "population_growth_pct_2024_25", order: "descending"},
          {field: "population_2025", order: "descending"}
        ]
      },
      {filter: "datum.access_rank <= 10"},
      {calculate: "format(datum.access_rank, '02d') + '. ' + datum.sa2_name", as: "rank_label"}
    ],
    layer: [
      {
        mark: {type: "bar", cornerRadiusEnd: 3},
        encoding: {
          y: {field: "rank_label", type: "nominal", title: null, axis: {labelLimit: 190}},
          x: {field: "access_metric", type: "quantitative", title: modeOptions[state.mode].axis},
          color: {
            field: "bar_group",
            type: "nominal",
            title: "Growth context",
            scale: {
              domain: ["Decline", "Stable", "Growing", "Rapid growth warning"],
              range: ["#8a8f91", "#8fb8aa", "#e2a43a", "#b45145"]
            }
          },
          tooltip: [
            {field: "sa2_name", title: "SA2"},
            {field: "population_2025", title: "Population", format: ",.0f"},
            {field: "population_growth_pct_2024_25", title: "Growth", format: ".1f"},
            {field: "access_metric", title: modeOptions[state.mode].axis, format: ".2f"}
          ]
        }
      }
    ],
    config: baseConfig()
  };
}

function buildGrowthSpec() {
  return {
    $schema: "https://vega.github.io/schema/vega-lite/v5.json",
    description: "Interactive growth ranking coloured by selected access metric.",
    width: "container",
    height: 320,
    background: "transparent",
    data: {url: "data/melbourne_access.csv"},
    transform: [
      {filter: "datum.population_2025 >= 3000"},
      ...areaTransform(),
      ...metricTransforms(),
      {window: [{op: "row_number", as: "growth_rank"}], sort: [{field: "population_growth_pct_2024_25", order: "descending"}]},
      {filter: "datum.growth_rank <= 15"},
      {calculate: "format(datum.growth_rank, '02d') + '. ' + datum.sa2_name", as: "rank_label"}
    ],
    layer: [
      {
        mark: {type: "bar", cornerRadiusEnd: 3},
        encoding: {
          y: {field: "rank_label", type: "nominal", title: null, axis: {labelLimit: 200}},
          x: {field: "population_growth_pct_2024_25", type: "quantitative", title: "Population growth 2024-25 (%)"},
          color: {
            field: "dynamic_access_category",
            type: "nominal",
            title: "Access",
            scale: {
              domain: ["Very low", "Low", "Moderate", "High"],
              range: ["#b45145", "#e2a43a", "#6f9ec7", "#1f7a63"]
            }
          },
          tooltip: [
            {field: "sa2_name", title: "SA2"},
            {field: "population_growth_pct_2024_25", title: "Growth", format: ".1f"},
            {field: "population_2025", title: "Population", format: ",.0f"},
            {field: "access_metric", title: modeOptions[state.mode].axis, format: ".2f"}
          ]
        }
      }
    ],
    config: baseConfig("bottom")
  };
}

function buildHeatmapSpec() {
  return {
    $schema: "https://vega.github.io/schema/vega-lite/v5.json",
    description: "Interactive heatmap crossing growth with selected access metric.",
    width: "container",
    height: 230,
    background: "transparent",
    data: {url: "data/melbourne_access.csv"},
    transform: [
      {filter: "datum.population_2025 >= 3000"},
      ...areaTransform(),
      ...metricTransforms(),
      {
        aggregate: [
          {op: "count", as: "areas"},
          {op: "sum", field: "population_2025", as: "population"}
        ],
        groupby: ["growth_category", "dynamic_access_category"]
      },
      {calculate: "format(datum.population / 1000, '.0f') + 'k residents'", as: "population_label"}
    ],
    layer: [
      {
        mark: {type: "rect", cornerRadius: 2},
        encoding: {
          x: {
            field: "dynamic_access_category",
            type: "ordinal",
            title: "Access category",
            sort: ["Very low", "Low", "Moderate", "High"],
            axis: {labelAngle: 0, labelLimit: 90}
          },
          y: {
            field: "growth_category",
            type: "ordinal",
            title: "Growth category",
            sort: ["Rapid growth", "Growing", "Stable", "Decline"],
            axis: {labelLimit: 90}
          },
          color: {field: "population", type: "quantitative", title: "Population in cell", scale: {range: ["#f7faf8", "#f1cf8a", "#d65f5f", "#8d3b33"]}},
          tooltip: [
            {field: "growth_category", title: "Growth"},
            {field: "dynamic_access_category", title: "Access"},
            {field: "areas", title: "SA2 areas", format: ",.0f"},
            {field: "population", title: "Population", format: ",.0f"}
          ]
        }
      },
      {
        transform: [{filter: "datum.growth_category == 'Rapid growth' && (datum.dynamic_access_category == 'Very low' || datum.dynamic_access_category == 'Low')"}],
        mark: {type: "rect", fill: null, stroke: "#293233", strokeWidth: 2.2},
        encoding: {
          x: {field: "dynamic_access_category", type: "ordinal", sort: ["Very low", "Low", "Moderate", "High"]},
          y: {field: "growth_category", type: "ordinal", sort: ["Rapid growth", "Growing", "Stable", "Decline"]}
        }
      },
      {
        mark: {type: "text", fontSize: 12, fontWeight: 800},
        encoding: {
          x: {
            field: "dynamic_access_category",
            type: "ordinal",
            sort: ["Very low", "Low", "Moderate", "High"]
          },
          y: {
            field: "growth_category",
            type: "ordinal",
            sort: ["Rapid growth", "Growing", "Stable", "Decline"]
          },
          text: {field: "population_label"},
          color: {
            condition: {test: "datum.population > 2200000", value: "#ffffff"},
            value: "#243739"
          }
        }
      }
    ],
    config: baseConfig()
  };
}

function buildLinesSpec() {
  return {
    $schema: "https://vega.github.io/schema/vega-lite/v5.json",
    description: "Interactive multi-line chart of population trajectories for selected SA2 areas.",
    width: "container",
    height: 310,
    background: "transparent",
    data: {url: "data/population_timeseries.csv"},
    transform: [
      ...areaTransform(),
      {calculate: "datum.area_band == 'Outer / growth corridor' ? 'Outer corridor' : datum.area_band", as: "area_pattern"}
    ],
    layer: [
      {
        mark: {type: "line", point: false, strokeWidth: 2.4},
        encoding: {
          x: {field: "year", type: "ordinal", title: "Year"},
          y: {field: "population", type: "quantitative", title: "Population", axis: {format: ",.0f"}},
          color: {
            field: "sa2_name",
            type: "nominal",
            title: "Selected SA2",
            legend: {orient: "bottom", columns: 2}
          },
          strokeDash: {
            field: "area_pattern",
            type: "nominal",
            title: "Area type (line pattern)",
            scale: {
              domain: ["Inner Melbourne", "Middle ring", "Outer corridor"],
              range: [[1, 0], [6, 4], [2, 3]]
            },
            legend: {
              orient: "bottom",
              direction: "vertical",
              columns: 1,
              labelLimit: 160,
              symbolType: "stroke",
              symbolStrokeWidth: 3
            }
          },
          tooltip: [
            {field: "sa2_name", title: "SA2"},
            {field: "year", title: "Year"},
            {field: "population", title: "Population", format: ",.0f"}
          ]
        }
      },
      {
        mark: {type: "circle", filled: true, size: 48, opacity: 0.92},
        encoding: {
          x: {field: "year", type: "ordinal", title: "Year"},
          y: {field: "population", type: "quantitative", title: "Population"},
          color: {
            field: "sa2_name",
            type: "nominal",
            title: "Selected SA2",
            legend: {orient: "bottom", columns: 2}
          },
          tooltip: [
            {field: "sa2_name", title: "SA2"},
            {field: "area_band", title: "Area type"},
            {field: "year", title: "Year"},
            {field: "population", title: "Population", format: ",.0f"}
          ]
        }
      },
      {
        transform: [
          {filter: "datum.year == 2025"},
          {window: [{op: "rank", as: "line_label_rank"}], sort: [{field: "population", order: "descending"}]},
          {filter: "datum.line_label_rank == 1"},
          {calculate: "datum.sa2_name + ': ' + format(datum.population, ',.0f')", as: "end_label"}
        ],
        mark: {type: "text", align: "right", baseline: "middle", dx: -8, dy: -8, fontSize: 11, fontWeight: 700, color: "#293233", limit: 130},
        encoding: {
          x: {field: "year", type: "ordinal", title: "Year"},
          y: {field: "population", type: "quantitative", title: "Population"},
          text: {field: "end_label"}
        }
      }
    ],
    config: baseConfig("bottom")
  };
}

function buildAreaSummarySpec() {
  const selectedArea = state.area === "All" ? null : state.area;
  return {
    $schema: "https://vega.github.io/schema/vega-lite/v5.json",
    description: "Interactive dot plot comparing area type by median access and mean growth.",
    width: "container",
    height: 240,
    background: "transparent",
    data: {url: "data/area_summary.csv"},
    transform: selectedArea ? [{filter: `datum.area_band == '${selectedArea}'`}] : [],
    layer: [
      {
        mark: {type: "circle", filled: true, stroke: "#1c2526", strokeWidth: 0.6},
        encoding: {
          x: {field: "median_stops_per_10000_people", type: "quantitative", title: "Median all-stop access per 10,000 residents", scale: {domain: [30, 45]}},
          y: {field: "mean_growth_pct", type: "quantitative", title: "Mean growth 2024-25 (%)", scale: {domain: [1.3, 2.0]}},
          size: {field: "population_2025", type: "quantitative", legend: null, scale: {range: [500, 1800]}},
          color: {
            field: "area_band",
            type: "nominal",
            title: "Area type",
            scale: {domain: ["Inner Melbourne", "Middle ring", "Outer / growth corridor"], range: ["#1f7a63", "#5f7f94", "#6f9ec7"]},
            legend: {orient: "bottom"}
          },
          tooltip: [
            {field: "area_band", title: "Area type"},
            {field: "areas", title: "SA2 count"},
            {field: "population_2025", title: "Population", format: ",.0f"},
            {field: "median_stops_per_10000_people", title: "Median all stops per 10,000", format: ".2f"},
            {field: "mean_growth_pct", title: "Mean growth", format: ".2f"}
          ]
        }
      }
    ],
    config: baseConfig("bottom")
  };
}

function buildDensitySpec() {
  return {
    $schema: "https://vega.github.io/schema/vega-lite/v5.json",
    description: "Interactive density histogram by selected access category.",
    width: "container",
    height: 250,
    background: "transparent",
    data: {url: "data/melbourne_access.csv"},
    transform: [
      {filter: "datum.population_2025 >= 3000"},
      ...areaTransform(),
      {calculate: "datum.population_density_2025 / 1000", as: "density_thousands"},
      ...metricTransforms()
    ],
    mark: {type: "bar", cornerRadiusTopLeft: 2, cornerRadiusTopRight: 2},
    encoding: {
      x: {
        field: "density_thousands",
        type: "quantitative",
        bin: {step: 1},
        title: "Population density (thousand residents per km2)",
        axis: {values: [0, 5, 10, 15, 20, 25, 30, 35, 40, 45]}
      },
      y: {aggregate: "count", type: "quantitative", title: "SA2 areas"},
      color: {
        field: "dynamic_access_category",
        type: "nominal",
        title: "Access",
        scale: {domain: ["Very low", "Low", "Moderate", "High"], range: ["#b45145", "#e2a43a", "#6f9ec7", "#1f7a63"]},
        legend: {orient: "bottom"}
      },
      tooltip: [
        {aggregate: "count", type: "quantitative", title: "SA2 areas"},
        {field: "dynamic_access_category", title: "Access"}
      ]
    },
    config: baseConfig("bottom")
  };
}

async function getSpec(chart) {
  if (chart.builder) {
    return chart.builder();
  }
  if (!specCache.has(chart.spec)) {
    const response = await fetch(chart.spec);
    specCache.set(chart.spec, await response.json());
  }
  return withAreaFilter(specCache.get(chart.spec), chart.areaField);
}

async function renderCharts() {
  document.querySelectorAll(".vis").forEach((container) => {
    container.classList.add("is-loading");
  });

  for (const view of views.values()) {
    view.finalize();
  }
  views.clear();

  for (const chart of charts) {
    const container = document.querySelector(chart.target);
    try {
      const spec = await getSpec(chart);
      const result = await vegaEmbed(chart.target, spec, embedOptions);
      views.set(chart.target, result.view);
      container.classList.remove("has-rendered");
      requestAnimationFrame(() => container.classList.add("has-rendered"));
      container.classList.remove("is-loading");
    } catch (error) {
      container.classList.remove("is-loading");
      container.innerHTML = `<p class="error">This chart could not load. Open the project with VS Code Live Server or from http://localhost:8000.</p>`;
      console.error(chart.target, error);
    }
  }
}

function updateControls() {
  document.querySelectorAll("[data-area]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.area === state.area);
  });
  document.querySelectorAll("[data-mode]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.mode === state.mode);
  });
  document.querySelectorAll("[data-tour-step]").forEach((button) => {
    button.classList.toggle("is-active", Number(button.dataset.tourStep) === activeTourStep);
  });

  const areaText = state.area === "All" ? "all Greater Melbourne SA2 areas" : `${state.area} SA2 areas`;
  document.querySelector("#control-status").textContent = `Showing ${areaText} using ${modeOptions[state.mode].label}.`;
}

async function updateLensSummary() {
  const rows = (await getAccessRows()).filter((row) => {
    return row.population_2025 >= 3000 && (state.area === "All" || row.area_band === state.area);
  });
  const metrics = rows.map(metricForRow);
  const warningRows = rows.filter((row) => {
    return metricForRow(row) < 20 && row.population_growth_pct_2024_25 >= 6;
  });
  const warningPopulation = warningRows.reduce((total, row) => total + row.population_2025, 0);
  const strongestWarning = warningRows
    .map((row) => ({row, metric: metricForRow(row)}))
    .sort((a, b) => a.metric - b.metric || b.row.population_growth_pct_2024_25 - a.row.population_growth_pct_2024_25)[0];

  animateMetric(document.querySelector("#lens-median"), median(metrics), (value) => value.toFixed(1));
  animateMetric(document.querySelector("#lens-warning-count"), warningRows.length, (value) => Math.round(value).toLocaleString("en-AU"));
  animateMetric(document.querySelector("#lens-warning-population"), warningPopulation, (value) => formatCompact(value));
  document.querySelector("#lens-note").textContent = strongestWarning
    ? `${strongestWarning.row.sa2_name} is the sharpest warning in this lens: ${strongestWarning.metric.toFixed(1)} ${modeOptions[state.mode].axis.toLowerCase()} with ${strongestWarning.row.population_growth_pct_2024_25.toFixed(1)}% growth.`
    : `No rapid-growth SA2s in this lens fall below 20 ${modeOptions[state.mode].axis.toLowerCase()}.`;
}

function inferTourStep() {
  const match = tourSteps.findIndex((step) => step.area === state.area && step.mode === state.mode);
  activeTourStep = match >= 0 ? match : -1;
}

function stopTour() {
  if (tourTimer) {
    clearInterval(tourTimer);
    tourTimer = null;
  }
  const playButton = document.querySelector("#story-play");
  if (playButton) {
    playButton.classList.remove("is-playing");
    playButton.textContent = "Play guided comparison";
  }
}

function applyLens(area, mode, {fromTour = false} = {}) {
  state.area = area;
  state.mode = mode;
  if (!fromTour) {
    stopTour();
    inferTourStep();
  }
  updateControls();
  updateLensSummary();
  renderCharts();
}

function applyTourStep(stepIndex) {
  const step = tourSteps[stepIndex];
  activeTourStep = stepIndex;
  applyLens(step.area, step.mode, {fromTour: true});
}

function bindControls() {
  document.querySelectorAll("[data-area]").forEach((button) => {
    button.addEventListener("click", () => {
      applyLens(button.dataset.area, state.mode);
    });
  });

  document.querySelectorAll("[data-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      applyLens(state.area, button.dataset.mode);
    });
  });

  document.querySelectorAll("[data-tour-step]").forEach((button) => {
    button.addEventListener("click", () => {
      stopTour();
      applyTourStep(Number(button.dataset.tourStep));
    });
  });

  document.querySelector("#story-play").addEventListener("click", () => {
    if (tourTimer) {
      stopTour();
      return;
    }

    const playButton = document.querySelector("#story-play");
    playButton.classList.add("is-playing");
    playButton.textContent = "Pause guided comparison";
    applyTourStep(0);
    document.querySelector(".controls-panel").scrollIntoView({behavior: reduceMotion ? "auto" : "smooth", block: "start"});
    tourTimer = setInterval(() => {
      const nextStep = activeTourStep >= tourSteps.length - 1 ? 0 : activeTourStep + 1;
      applyTourStep(nextStep);
    }, reduceMotion ? 2600 : 5200);
  });
}

function setupScrollProgress() {
  const progressBar = document.querySelector(".scroll-progress span");
  const updateProgress = () => {
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    const progress = scrollable > 0 ? window.scrollY / scrollable : 0;
    progressBar.style.transform = `scaleX(${Math.max(0, Math.min(progress, 1))})`;
  };

  updateProgress();
  window.addEventListener("scroll", updateProgress, {passive: true});
  window.addEventListener("resize", updateProgress);
}

function setupDockVisibility() {
  const dock = document.querySelector(".interaction-dock");
  const controls = document.querySelector(".controls-panel");
  const updateDock = () => {
    const threshold = controls.offsetTop + controls.offsetHeight - 40;
    dock.classList.toggle("is-visible", window.scrollY > threshold);
  };

  updateDock();
  window.addEventListener("scroll", updateDock, {passive: true});
  window.addEventListener("resize", updateDock);
}

function setupActiveSections() {
  const sections = document.querySelectorAll(".story-section");
  if (!("IntersectionObserver" in window)) {
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) {
        return;
      }
      sections.forEach((section) => section.classList.toggle("is-current", section === visible.target));
    },
    {threshold: [0.22, 0.38, 0.54], rootMargin: "-8% 0px -45% 0px"}
  );

  sections.forEach((section) => observer.observe(section));
}

function setupPointerLift() {
  document.querySelectorAll(".storyboard article, .lens-summary div").forEach((item) => {
    item.addEventListener("pointermove", (event) => {
      if (reduceMotion) {
        return;
      }
      const rect = item.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width - 0.5) * 6;
      const y = ((event.clientY - rect.top) / rect.height - 0.5) * 6;
      item.style.transform = `translate(${x}px, ${y}px)`;
    });
    item.addEventListener("pointerleave", () => {
      item.style.transform = "";
    });
  });
}

function formatStat(value, sourceText) {
  if (sourceText.includes(",")) {
    return Math.round(value).toLocaleString("en-AU");
  }
  return String(Math.round(value));
}

function animateStats() {
  if (reduceMotion) {
    return;
  }

  document.querySelectorAll(".stat strong").forEach((stat) => {
    const original = stat.textContent.trim();
    const target = Number(original.replace(/,/g, ""));
    if (!Number.isFinite(target)) {
      return;
    }

    const duration = 950;
    const start = performance.now();
    const tick = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      stat.textContent = formatStat(target * eased, original);
      if (progress < 1) {
        requestAnimationFrame(tick);
      } else {
        stat.textContent = original;
      }
    };

    requestAnimationFrame(tick);
  });
}

function setupRevealAnimation() {
  const revealItems = document.querySelectorAll(".map-feature, .controls-panel, .story-section, .closing, .sources");
  if (reduceMotion || !("IntersectionObserver" in window)) {
    revealItems.forEach((item) => item.classList.add("is-visible"));
    return;
  }

  revealItems.forEach((item) => item.classList.add("will-reveal"));
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return;
        }
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    {threshold: 0.16, rootMargin: "0px 0px -8% 0px"}
  );

  revealItems.forEach((item) => observer.observe(item));
}

bindControls();
updateControls();
updateLensSummary();
setupScrollProgress();
setupDockVisibility();
setupActiveSections();
setupPointerLift();
setupRevealAnimation();
animateStats();
renderCharts();
