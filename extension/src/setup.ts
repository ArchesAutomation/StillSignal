const button = document.getElementById("grant") as HTMLButtonElement;
const permissionStatus = document.getElementById("permission-status")!;
button.onclick = async () => {
  button.disabled = true;
  let stream: MediaStream | undefined;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false,
    });
    await chrome.runtime.sendMessage({
      target: "worker",
      payload: { type: "permission", granted: true },
    });
    permissionStatus.textContent =
      "Microphone enabled. Open the toolbar side panel and connect Trade Pulse.";
  } catch {
    await chrome.runtime.sendMessage({
      target: "worker",
      payload: { type: "permission", granted: false },
    });
    permissionStatus.textContent =
      "Microphone denied or unavailable. Allow this extension in Chrome’s microphone settings, check Windows/macOS microphone privacy settings, then try again.";
  } finally {
    stream?.getTracks().forEach((t) => t.stop());
    button.disabled = false;
  }
};
document.getElementById("settings")!.onclick = () =>
  void chrome.tabs.create({ url: "chrome://settings/content/microphone" });
export {};
