/* eslint-disable no-bitwise */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  MouseEvent,
  WheelEvent,
  TouchEvent,
  Touch,
  useMemo,
} from 'react';
import {
  isDown,
  isLeft,
  isRight,
  isUp,
} from '../../utils/keyboard/shortcuts';
import {
  colorHsl,
  formatNumber,
  round,
  remap,
} from '../../utils/number';

export interface LogEntry {
  [id: string]: number | string,
}

enum Colors {
  RED = '#f32450',
  CYAN = '#8dd3c7',
  YELLOW = '#ffff00',
  PURPLE = '#bebada',
  GREEN = '#77de3c',
  BLUE = '#2fe3ff',
  GREY = '#334455',
  WHITE = '#fff',
  BG = '#222629',
}

export interface SelectedField {
  name: string;
  units: string;
  scale: string | number;
  transform: string | number;
  format: string;
};

export interface PlottableField {
  min: number;
  max: number;
  scale: number;
  transform: number;
  units: string;
  format: string;
};

const Canvas = ({
  data,
  width,
  height,
  selectedFields,
}: {
  data: LogEntry[],
  width: number,
  height: number,
  selectedFields: SelectedField[],
}) => {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState(0);
  const [isMouseDown, setIsMouseDown] = useState(false);
  const [indicatorPos, setIndicatorPos] = useState(0);
  const [previousTouch, setPreviousTouch] = useState<Touch | null>(null);
  const leftBoundary = 0;
  const [rightBoundary, setRightBoundary] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const checkPan = useCallback((current: number, value: number) => {
    if (current > leftBoundary) {
      return leftBoundary;
    }
    if (current < rightBoundary) {
      return rightBoundary;
    }
    return value;
  }, [rightBoundary]);

  const hsl = useCallback((fieldIndex: number, allFields: number) => {
    const [hue] = colorHsl(0, allFields - 1, fieldIndex);
    return `hsl(${hue}, 90%, 50%)`;
  }, []);

  const canvas = canvasRef.current!;
  const ctx = useMemo(() => canvas && canvas.getContext('2d', { alpha: true })!, [canvas]);
  const canvasWidth = canvas ? canvas.width : 0;
  const canvasHeight = canvas ? canvas.height : 0;
  const areaWidth = canvas ? canvasWidth : 0;
  const areaHeight = canvas ? canvasHeight - 30 : 0; // leave some space in the bottom
  const lastIndex = data.length - 1;
  const maxIndex = useMemo(() => lastIndex / (zoom < 1 ? 1 : zoom), [lastIndex, zoom]);
  const scaledWidth = useMemo(() => round(areaWidth * zoom / 1), [areaWidth, zoom]);
  const startIndex = useMemo(
    () => pan >= 0 ? 0 : -(pan * maxIndex / areaWidth),
    [areaWidth, maxIndex, pan],
  );
  const pixelsOnScreen = round((maxIndex - startIndex + 1) / areaWidth);
  // map available pixels to the number of data entries
  // const resolution = pixelsOnScreen < 1 ? 1 : pixelsOnScreen;
  const resolution = 1;

  // find max values for each selected field so we can calculate scale
  const fieldsToPlot = useMemo(() => {
    const temp: { [index: string]: PlottableField } = {};

    data.forEach((record) => {
      selectedFields.forEach(({ name, scale, transform, units, format }) => {
        const value = record[name];
        if (!temp[name]) {
          temp[name] = {
            min: 0,
            max: 0,
            scale: scale as number,
            transform: transform as number,
            units,
            format,
          };
        }
        if (value > temp[name].max) {
          temp[name].max = record[name] as number;
        }
        if (value < temp[name].min) {
          temp[name].min = record[name] as number;
        }
      });
    });

    return temp;
  }, [data, selectedFields]);

  const fieldsKeys = useMemo(() => Object.keys(fieldsToPlot), [fieldsToPlot]);
  const dataWindow = useMemo(() => {
    const sliced = data.slice(startIndex, startIndex + maxIndex); // slice data
    // skip n-th element to reduce number of data points
    if (resolution > 1) {
      return sliced.filter((_, index) => index % resolution === 0);
    }

    return sliced;
  }, [data, maxIndex, resolution, startIndex]);
  const lastEntry = useMemo(() => data[lastIndex], [data, lastIndex]);
  // const maxTime = useMemo(() => (lastEntry.Time as number) / (zoom < 1 ? 1 : zoom), [lastEntry.Time, zoom]);
  // const timeScale = useMemo(() => areaWidth / maxTime, [areaWidth, maxTime]);
  // const panScaled = pan;
  const indexScale = useMemo(
    () => areaWidth / (dataWindow.length / (zoom < 1 ? 1 : zoom)),
    [areaWidth, dataWindow.length, zoom],
  );
  const panScaled = 0;
  // const startTime = ((dataWindow[startIndex] || {}).Time || 0) as number;

  const drawText = useCallback((left: number, top: number, text: string, color: string, textAlign = 'left') => {
    ctx.textAlign = textAlign as any;
    // draw background
    ctx.fillStyle = Colors.BG;
    ctx.fillText(text, left + 2, top + 2);
    // draw foreground
    ctx.fillStyle = color;
    ctx.fillText(text, left, top);
  }, [ctx]);

  // const drawMarker = useCallback((position: number) => {
  //   const prevStyle = ctx.strokeStyle;
  //   ctx.strokeStyle = Colors.RED;
  //   ctx.setLineDash([5]);
  //   ctx.beginPath();
  //   ctx.moveTo(position, 0);
  //   ctx.lineTo(position, canvasHeight);
  //   ctx.stroke();
  //   ctx.setLineDash([]);
  //   ctx.strokeStyle = prevStyle;
  // }, [canvasHeight, ctx]);

  // TODO: replace plotField with plotFields - single loop for all fields
  const plotField = useCallback((field: string, min: number, max: number, color: string) => {
    ctx.strokeStyle = color;
    ctx.beginPath();

    // TODO: move max and min to the global scope to use in indicator (position text over a line)

    // initial position
    const initialValue = areaHeight - remap(dataWindow[0][field] as number, min, max, 0, areaHeight);
    ctx.moveTo(0, initialValue);

    dataWindow.forEach((entry, index) => {
      // const lastRecord: LogEntry = dataWindow[index - 1] ?? { Time: 0 };
      // const time = (entry.Time ? entry.Time : lastRecord.Time) as number * timeScale;

      // scale the value
      const value = areaHeight - remap(entry[field] as number, min, max, 0, areaHeight);
      const position = round(index * indexScale);

      switch (entry.type) {
        case 'field':
          ctx.lineTo(position, round(value));
          break;
        case 'marker':
          // TODO: this is drawn x times
          // drawText(position, areaHeight / 2, `Marker at: ${lastRecord.Time}`, Colors.GREEN);
          // drawMarker(position); // TODO: fix moveTo
          break;
        default:
          break;
      }

      if (index === 4) {
        drawText(
          100,
          100,
          `FIRST: pan: ${pan}, scaledWidth: ${scaledWidth}, index: ${index}, pos: ${position}, indexScale: ${round(indexScale, 2)}, panScaled: ${panScaled}, zoom: ${round(zoom)}, areaWidth: ${areaWidth}, pixels: ${pixelsOnScreen}, windowLength: ${dataWindow.length}`,
          Colors.YELLOW,
        );
      }
      if (index + 10 === dataWindow.length) {
        drawText(
          100,
          150,
          `LAST: pan: ${pan}, scaledWidth: ${scaledWidth}, index: ${index}, pos: ${position}, indexScale: ${round(indexScale, 2)}, panScaled: ${panScaled}, zoom: ${round(zoom)}, areaWidth: ${areaWidth}, pixels: ${pixelsOnScreen}, windowLength: ${dataWindow.length}`,
          Colors.RED,
        );
      }
      // drawText(position, index * 15, `${index}`, Colors.WHITE);
    });

    ctx.stroke();
  }, [areaHeight, areaWidth, ctx, dataWindow, drawText, indexScale, pan, pixelsOnScreen, scaledWidth, zoom]);

  const drawIndicator = useCallback(() => {
    ctx.setLineDash([5]);
    ctx.strokeStyle = Colors.WHITE;
    ctx.beginPath();

    // remap indicator position to index in the data array
    // FIXME: this is bad
    const index = indicatorPos < 0 ? 0 : round(remap(
      indicatorPos,
      0,
      areaWidth,
      0,
      dataWindow.length - 1,
    ));
    // console.log('res', resolution);
    // TODO:
    // 1px = 1 index % resolution
    // const index = indicatorPos < 0 ? 0 : indicatorPos;

    let currentData = dataWindow[index];

    if (!currentData) {
      console.info('Out of bounds', index);
      return;
    }

    if (currentData.type === 'marker') {
      // take previous data point for markers
      currentData = dataWindow[index - 1];
    }

    ctx.moveTo(indicatorPos, 0);

    let left = indicatorPos + 10;
    let textAlign = 'left';
    if (indicatorPos > areaWidth / 2) {
      // flip text to the left side of the indicator
      textAlign = 'right';
      left = indicatorPos - 10;
    }

    let top = 0;
    fieldsKeys.forEach((name, fieldIndex) => {
      const field = fieldsToPlot[name];
      const { units, scale, transform, format } = field;
      const value = formatNumber((currentData[name] as number * scale) + transform, format);
      top += 20;

      drawText(
        left,
        top,
        `${name}: ${value}${units ? ` (${units})` : ''}`,
        hsl(fieldIndex, fieldsKeys.length),
        textAlign,
      );
    });

    // draw Time
    drawText(
      left,
      areaHeight + 20,
      `${round(currentData.Time as number, 3)}s`,
      // msToTime(Math.round(currentData.Time as number * 1000)),
      Colors.GREY, textAlign,
    );

    // TODO: DEBUG
    // 1px = 1 index % resolution
    drawText(
      left,
      areaHeight - 20,
      `${index} - ${indicatorPos}`,
      Colors.RED, textAlign,
    );

    ctx.lineTo(indicatorPos, canvasHeight);
    ctx.stroke();
    ctx.setLineDash([]);
  }, [areaHeight, areaWidth, canvasHeight, ctx, dataWindow, drawText, fieldsKeys, fieldsToPlot, hsl, indicatorPos]);

  const plot = useCallback(() => {
    if (!ctx) {
      return;
    }

    setRightBoundary(-(scaledWidth - areaWidth));

    // basic settings
    ctx.font = '14px Arial';
    ctx.lineWidth = Math.max(1.25, areaHeight / 400);

    if (zoom < 1) {
      setZoom(1);
      setPan(0);
      return;
    }

    if (pan > leftBoundary || pan < rightBoundary) {
      return;
    }

    // clear
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    fieldsKeys.forEach((name, fieldIndex) => plotField(
      name,
      fieldsToPlot[name].min,
      fieldsToPlot[name].max,
      hsl(fieldIndex, fieldsKeys.length)),
    );

    drawIndicator();
  }, [ctx, scaledWidth, areaWidth, areaHeight, zoom, pan, rightBoundary, canvasWidth, canvasHeight, fieldsKeys, drawIndicator, plotField, fieldsToPlot, hsl]);

  const onWheel = useCallback((e: WheelEvent) => {
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      setZoom((current) => {
        if (current < 1) {
          setPan(0);
          return 1;
        }
        return current - e.deltaY / 1000;
      });
    }
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      setPan((current) => checkPan(current, current - e.deltaX));
    }
  }, [checkPan]);

  const onMouseMove = useCallback((e: MouseEvent) => {
    setIndicatorPos(e.nativeEvent.offsetX);
    if (isMouseDown) {
      setPan((current) => checkPan(current, current + e.movementX));
    }
  }, [checkPan, isMouseDown]);

  const onTouchMove = useCallback((e: TouchEvent) => {
    const touch = e.touches[0];
    if (previousTouch) {
      (e as any).movementX = touch.pageX - previousTouch.pageX;
      (e as any).movementY = touch.pageY - previousTouch.pageY;
      setPan((current) => checkPan(current, current + (e as any).movementX));
    };

    setPreviousTouch(touch);
  }, [checkPan, previousTouch]);

  const keyboardListener = useCallback((e: KeyboardEvent) => {
    if (isUp(e)) {
      setZoom((current) => current + 0.1);
    }
    if (isDown(e)) {
      setZoom((current) => {
        if (current < 1) {
          setPan(0);
          return 1;
        }
        return current - 0.1;
      });
    }
    if (isLeft(e)) {
      setPan((current) => checkPan(current, current + 20));
    }
    if (isRight(e)) {
      setPan((current) => checkPan(current, current - 20));
    }
  }, [checkPan]);

  useEffect(() => {
    plot();
    document.addEventListener('keydown', keyboardListener);

    // TODO: crate custom hook
    return () => {
      document.removeEventListener('keydown', keyboardListener);
    };
  }, [plot, width, height, keyboardListener]);

  return (
    <canvas
      ref={canvasRef as any}
      className="plot"
      width={width}
      height={height}
      onWheel={onWheel}
      onMouseMove={onMouseMove}
      onTouchMove={onTouchMove}
      onMouseDown={() => setIsMouseDown(true)}
      onMouseUp={() => setIsMouseDown(false)}
      onTouchStart={() => setPreviousTouch(null)}
    />
  );
};

export default Canvas;
