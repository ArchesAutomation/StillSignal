export type PlasmaStatus = 'off' | 'loading' | 'active' | 'fallback' | 'paused';
let status: PlasmaStatus = 'off';
const listeners = new Set<() => void>();
export const getPlasmaStatus = () => status;
export const getServerPlasmaStatus = (): PlasmaStatus => 'off';
export function subscribePlasmaStatus(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function setPlasmaStatus(next: PlasmaStatus) {
  if (next !== status) { status = next; listeners.forEach(listener => listener()); }
}
