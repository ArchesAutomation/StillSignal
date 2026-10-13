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
  return typeof navigator !== "undefined" && "bluetooth" in navigator;
}
export async function connectHeartRate(
  onSample: (sample: Sample) => void,
  onDisconnect: () => void,
) {
  if (!bluetoothSupported())
    throw new Error(
      "Pair WHOOP using Chrome or Edge on a supported desktop, or Chrome on Android. Safari and iPhone browsers do not support Bluetooth recording. Your journal, TradingView alerts, and CSV imports still work here.",
    );
  const device = await (
    navigator as unknown as { bluetooth: Bluetooth }
  ).bluetooth.requestDevice({ filters: [{ services: ["heart_rate"] }] });
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
  await characteristic.startNotifications();
  return {
    name: device.name || "Heart-rate sensor",
    disconnect: () => {
      characteristic.removeEventListener("characteristicvaluechanged", receive);
      device.removeEventListener("gattserverdisconnected", onDisconnect);
      device.gatt?.disconnect();
    },
  };
}
