export type PocketStateInitMode = 'flow' | 'mimi' | 'default';

type NumericArray = BigInt64Array | Uint8Array | Float32Array;

export interface SerializedPocketTensor {
  dtype: 'float32' | 'int64' | 'bool';
  data: NumericArray;
  shape: number[];
}

export type SerializedPocketState = Record<string, SerializedPocketTensor>;

export const tensorElementCount = (shape: readonly (number | string)[]): number => {
  const dims = shape.map((dim) => (typeof dim === 'number' ? dim : 0));
  return dims.reduce((total, dim) => total * dim, 1);
};

export const makeInitialStateData = (
  type: string,
  shape: readonly (number | string)[],
  mode: PocketStateInitMode = 'default',
): NumericArray => {
  const total = tensorElementCount(shape);
  switch (type) {
    case 'int64':
    case 'tensor(int64)':
      return new BigInt64Array(total);
    case 'bool':
    case 'tensor(bool)': {
      const data = new Uint8Array(total);
      data.fill(1);
      return data;
    }
    default: {
      const data = new Float32Array(total);
      if (mode === 'flow' && total > 0) {
        data.fill(NaN);
      }
      return data;
    }
  }
};
