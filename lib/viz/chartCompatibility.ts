export const chartAlternatives: Record<string, string[]> = {
  bar:       ['line', 'pie', 'donut', 'histogram'],
  line:      ['scatter', 'bar', 'histogram'],
  scatter:   ['line', 'bubble', 'heatmap'],
  pie:       ['donut', 'bar'],
  donut:     ['pie', 'bar'],
  histogram: ['bar', 'line', 'scatter'],
  heatmap:   ['scatter', 'bubble'],
  bubble:    ['scatter', 'heatmap'],
  funnel:    ['bar'],
}
