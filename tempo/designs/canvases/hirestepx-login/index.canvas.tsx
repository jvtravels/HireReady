import type { TempoPage, TempoStoryboard } from 'tempo-sdk';
import { HireStepXLogin } from './Login';

const page: TempoPage = {
  name: "HireStepX — Login (Instrument Serif + Neue Montreal)",
};

export default page;

/* Smoke-test storyboard — minimal render that proves Tempo's canvas runtime
   can compile this file. If THIS one says "Preview not loaded" the issue is
   environment/SDK; if only the larger one fails it's a render/layout issue. */
export const SmokeTest: TempoStoryboard = {
  name: "Smoke test — should always render",
  render: () => (
    <div style={{
      height: "100%", width: "100%",
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "#F4F4F0", color: "#0F1B30",
      fontFamily: "system-ui, -apple-system, sans-serif", fontSize: 18,
    }}>
      Login canvas runtime OK ✓
    </div>
  ),
  layout: { x: 1500, y: 0, width: 480, height: 240 },
};

export const Login: TempoStoryboard = {
  // Storyboard rect is slightly taller than the design's 1024 minimum so the
  // inner content has breathing room and never overflows the iframe.
  name: "Login — Full Screen",
  render: () => <HireStepXLogin />,
  layout: { x: 0, y: 0, width: 1440, height: 1080 },
};
