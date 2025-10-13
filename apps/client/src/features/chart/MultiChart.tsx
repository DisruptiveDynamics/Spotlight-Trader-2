import { useChartState } from "../../state/chartState";
import { Pane } from "./Pane";
import { ChartErrorBoundary } from "../../components/ChartErrorBoundary";

export function MultiChart() {
  const { layout, focusedPane } = useChartState();

  const getGridClass = () => {
    switch (layout) {
      case "1x1":
        return "grid-cols-1 grid-rows-1";
      case "2x1":
        return "grid-cols-2 grid-rows-1";
      case "2x2":
        return "grid-cols-2 grid-rows-2";
      default:
        return "grid-cols-1 grid-rows-1";
    }
  };

  const getPaneCount = () => {
    switch (layout) {
      case "1x1":
        return 1;
      case "2x1":
        return 2;
      case "2x2":
        return 4;
      default:
        return 1;
    }
  };

  const paneCount = getPaneCount();

  return (
    <div className={`grid ${getGridClass()} gap-2 w-full h-full p-2`}>
      {Array.from({ length: paneCount }).map((_, index) => (
        <div
          key={index}
          className={`relative rounded border ${
            focusedPane === index ? "border-blue-500 ring-2 ring-blue-500/50" : "border-gray-800"
          }`}
        >
          <ChartErrorBoundary paneId={`pane-${index}`}>
            <Pane paneId={index} className="w-full h-full" />
          </ChartErrorBoundary>
        </div>
      ))}
    </div>
  );
}
