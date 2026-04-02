import type { TempoPage, TempoStoryboard } from "tempo-sdk";
import {
  ColorPalette,
  TypographyScale,
  ComponentShowcase,
  CardShowcase,
  SpacingShowcase,
  BrandVoiceShowcase,
} from "./DesignTokens";

const page: TempoPage = {
  name: "Design System",
};

export default page;

export const Colors: TempoStoryboard = {
  render: () => <ColorPalette />,
  name: "Color Palette",
  layout: { x: 0, y: 0, width: 900, height: 520 },
};

export const Typography: TempoStoryboard = {
  render: () => <TypographyScale />,
  name: "Typography Scale",
  layout: { x: 940, y: 0, width: 700, height: 520 },
};

export const Components: TempoStoryboard = {
  render: () => <ComponentShowcase />,
  name: "Component Showcase",
  layout: { x: 0, y: 560, width: 900, height: 600 },
};

export const Cards: TempoStoryboard = {
  render: () => <CardShowcase />,
  name: "Card Showcase",
  layout: { x: 940, y: 560, width: 700, height: 600 },
};

export const Spacing: TempoStoryboard = {
  render: () => <SpacingShowcase />,
  name: "Spacing Scale",
  layout: { x: 0, y: 1200, width: 900, height: 400 },
};

export const BrandVoice: TempoStoryboard = {
  render: () => <BrandVoiceShowcase />,
  name: "Brand Voice",
  layout: { x: 940, y: 1200, width: 700, height: 400 },
};
