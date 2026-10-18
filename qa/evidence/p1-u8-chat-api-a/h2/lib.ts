export const B = "file:///C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/p1-u8";
export function dumpAll(fakeDb: any, names: string[]): Record<string, unknown[]> {
  const out: Record<string, unknown[]> = {};
  for (const n of names) out[n] = fakeDb.collection(n).all();
  return out;
}
