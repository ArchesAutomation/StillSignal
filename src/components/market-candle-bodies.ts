import type {
  IChartApi,
  ISeriesApi,
  ISeriesPrimitive,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  UTCTimestamp,
} from "lightweight-charts";
import type { Candle } from "@/lib/market/model";
// The shared time scale includes sub-second HR samples. Candle body width must span
// its market interval instead of one HR time step. Price/scale stay in the native series.
export class MarketCandleBodies implements ISeriesPrimitive {
  private bars: Candle[] = [];
  private chart: IChartApi;
  private series: ISeriesApi<"Candlestick">;
  private repaint: (() => void) | undefined;
  constructor(chart: IChartApi, series: ISeriesApi<"Candlestick">) {
    this.chart = chart;
    this.series = series;
  }
  attached(params: { requestUpdate: () => void }) {
    this.repaint = params.requestUpdate;
  }
  setData(bars: Candle[]) {
    this.bars = bars;
    this.repaint?.();
  }
  paneViews(): readonly IPrimitivePaneView[] {
    return [this.view];
  }
  private view: IPrimitivePaneView = {
    zOrder: () => "normal",
    renderer: () => this.renderer,
  };
  private renderer: IPrimitivePaneRenderer = {
    draw: (target) => {
      target.useMediaCoordinateSpace(({ context, mediaSize }) => {
        for (const bar of this.bars) {
          const x = this.chart
              .timeScale()
              .timeToCoordinate((bar.t / 1000) as UTCTimestamp),
            right = this.chart
              .timeScale()
              .timeToCoordinate((bar.end / 1000) as UTCTimestamp);
          const open = this.series.priceToCoordinate(bar.open),
            close = this.series.priceToCoordinate(bar.close);
          if (
            x === null ||
            open === null ||
            close === null ||
            x < -20 ||
            x > mediaSize.width + 20
          )
            continue;
          const width = Math.max(
            1,
            Math.min(18, (right === null ? 5 : Math.abs(right - x)) * 0.68),
          );
          context.fillStyle = bar.close >= bar.open ? "#66b99c" : "#e97979";
          context.fillRect(
            x - width / 2,
            Math.min(open, close),
            width,
            Math.max(1, Math.abs(open - close)),
          );
        }
      });
    },
  };
}
