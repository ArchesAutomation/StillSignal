import { decodeHeartRate } from "./analytics";
import type { Sample } from "./model";
type Characteristic = EventTarget & {
  value?: DataView;
  startNotifications: () => Promise<Characteristic>;
  stopNotifications: () => Promise<Characteristic>;
};
type Device = EventTarget & {
  name?: string;
  gatt?: {
    connected: boolean;
    connect: () => Promise<{
      getPrimaryService: (s: string) => Promise<{
        getCharacteristic: (s: string) => Promise<Characteristic>;
      }>;
    }>;
    disconnect: () => void;
  };
};
type Bluetooth = {
  requestDevice: (o: { filters: { services: string[] }[] }) => Promise<Device>;
};
export function bluetoothSupported() {
  return typeof navigator !== "undefined" &&
    typeof (navigator as unknown as { bluetooth?: Bluetooth }).bluetooth?.requestDevice === "function";
}
/** Call directly from the connection click, before storage or another window request. */
export function requestHeartRateDevice(): Promise<Device> {
  if (!bluetoothSupported())
    throw new Error(
      "Pair WHOOP using Chrome or Edge on a supported desktop, or Chrome on Android. Safari and iPhone browsers do not support Bluetooth recording. Your journal, TradingView alerts, and CSV imports still work here.",
    );
  return (
    navigator as unknown as { bluetooth: Bluetooth }
  ).bluetooth.requestDevice({ filters: [{ services: ["heart_rate"] }] }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    if (/globally disabled|not supported/i.test(message))
      throw new Error("Bluetooth is disabled in this browser. Open Still Signal in Chrome or Edge and click Attach WHOOP. Your journal remains available here.");
    if (/user gesture|user activation/i.test(message))
      throw new Error("Bluetooth needs a direct click. Click Attach WHOOP again to open the device chooser.");
    throw error;
  });
}
export async function connectHeartRate(
  onSample: (sample: Sample) => void,
  onDisconnect: () => void,
  selectedDevice?: Device,
) {
  const device = selectedDevice || await requestHeartRateDevice();
  try {
    const server = await device.gatt?.connect();
    if (!server)
      throw new Error(
        "Unable to connect. Enable Heart Rate Broadcast in the WHOOP app and try again.",
      );
    const service = await server.getPrimaryService("heart_rate");
    const characteristic = await service.getCharacteristic(
      "heart_rate_measurement",
    );
    const receive = () => {
      if (characteristic.value) {
        const bpm = decodeHeartRate(characteristic.value);
        if (bpm !== null) onSample({ t: Date.now(), bpm });
      }
    };
    characteristic.addEventListener("characteristicvaluechanged", receive);
    device.addEventListener("gattserverdisconnected", onDisconnect);
    try { await characteristic.startNotifications(); }
    catch (error) {
      characteristic.removeEventListener("characteristicvaluechanged", receive);
      device.removeEventListener("gattserverdisconnected", onDisconnect);
      throw error;
    }
    return {
      name: device.name || "Heart-rate sensor",
      disconnect: () => {
        characteristic.removeEventListener("characteristicvaluechanged", receive);
        device.removeEventListener("gattserverdisconnected", onDisconnect);
        device.gatt?.disconnect();
      },
    };
  } catch (error) {
    device.gatt?.disconnect();
    throw error;
  }
}
