
export function round2(value: number | string): string {
  const num = typeof value === 'string' ? Number(value) : value;
  return (Math.round((num + Number.EPSILON) * 100) / 100).toFixed(2);
}