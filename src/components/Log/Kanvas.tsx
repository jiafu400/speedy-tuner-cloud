import {
  useCallback,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Stage,
  Layer,
  Line,
} from 'react-konva';
import {
  colorHsl,
  remap,
  round,
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

const Kanvas = ({
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
  const stageRef = useRef();
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState(0);
  const [isMouseDown, setIsMouseDown] = useState(false);

  const hsl = useCallback((fieldIndex: number, allFields: number) => {
    const [hue] = colorHsl(0, allFields - 1, fieldIndex);
    return `hsl(${hue}, 90%, 50%)`;
  }, []);

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

  const dataForField = useCallback((name: string) => {
    const field = fieldsToPlot[name];
    // [x1, y1, x2, y5, ...]
    return data.map((entry, index) => {
      if (!entry[name]) {
        // missing data point or marker
        return [];
      }

      return [
        round(index * zoom),
        remap(entry[name] as number, field.min, field.max, 0, height),
      ];
    }).flat();
  }, [data, fieldsToPlot, height, zoom]);

  // console.log(zoom);

  // fieldsKeys.forEach((name, fieldIndex) => plotField(
  //   name,
  //   fieldsToPlot[name].min,
  //   fieldsToPlot[name].max,
  //   hsl(fieldIndex, fieldsKeys.length)),
  // );

  const onWheel = useCallback(({ evt }: { evt: WheelEvent }) => {
    // on touch pad we have 2 axis, handle Y
    if (Math.abs(evt.deltaY) > Math.abs(evt.deltaX)) {
      setZoom((current) => {
        if (current < 1) {
          setOffset(0);
          return 1;
        }

        return current - evt.deltaY / 1000;
      });

      // compensate - keep origin of zoom in the center
      setOffset((current) => current - (evt.deltaY * zoom));
    }

    // handle X axis
    if (Math.abs(evt.deltaX) > Math.abs(evt.deltaY)) {
      // setPan((current) => checkPan(current, current - e.deltaX));
      setOffset((current) => current + evt.deltaX);
    }
  }, [zoom]);

  const onMouseMove = useCallback(({ evt }: { evt: MouseEvent }) => {
    if (isMouseDown) {
      setOffset((current) => current - evt.movementX);
    }
  }, [isMouseDown]);

  const dragBoundFunc = useCallback((pos: { x: number, y: number }) => {
    const test2 = '';
    // console.log(pos);

    return {
      x: pos.x,
      y: 0,
    };
  }, []);

  return (
    <Stage
      ref={stageRef as any}
      width={width}
      height={height}
      // onMouseDown={() => setIsMouseDown(true)}
      // onMouseUp={() => setIsMouseDown(false)}
      // onMouseMove={onMouseMove}
      // offsetX={offset}
      draggable
      onWheel={onWheel}
    >
      <Layer>
        {selectedFields.map((field, index) => (
          <Line
            key={field.name}
            points={dataForField(field.name)}
            stroke={hsl(index, selectedFields.length)}
          />
        ))}
      </Layer>
    </Stage>
  );
};

export default Kanvas;
