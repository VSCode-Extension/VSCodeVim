import { Value } from './types';

export function displayValue(value: Value, topLevel = true): string {
  switch (value.type) {
    case 'number':
      return value.value.toString();
    case 'float': {
      // TODO: this is incorrect for float with exponent
      const result = value.value.toFixed(6).replace(/0*$/, '');
      if (result.endsWith('.')) {
        return result + '0';
      }
      return result;
    }
    case 'string':
      return topLevel ? value.value : `'${value.value.replace("'", "''")}'`;
    case 'list':
      return `[${value.items.map((v) => displayValue(v, false)).join(', ')}]`;
    case 'dict_val':
      return `{${[...value.items]
        .map(([k, v]) => `'${k}': ${displayValue(v, false)}`)
        .join(', ')}}`;
    case 'funcref':
      if (!value.arglist?.items.length) {
        if (value.dict) {
          return `function('${value.name}', ${displayValue(value.dict)})`;
        }
        return value.name;
      } else {
        if (value.dict) {
          return `function('${value.name}', ${displayValue(value.arglist)}, ${displayValue(
            value.dict,
          )})`;
        }
        return `function('${value.name}', ${displayValue(value.arglist)})`;
      }
    case 'blob':
      return (
        '0z' +
        [...new Uint8Array(value.data)]
          .map((byte) => byte.toString(16).padStart(2, '0'))
          .join('')
          .toUpperCase()
      );
    case 'register_val':
      return `register('${value.content}',  ${value.registerMode})`;
  }
}
