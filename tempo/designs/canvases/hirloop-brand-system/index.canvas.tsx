import type { TempoPage, TempoStoryboard } from 'tempo-sdk';
import { ColorPalette, Typography, Components, MetricCards, ResponseCard } from './BrandShowcase';

const page: TempoPage = {
  name: "Hirloop Brand System",
};

export default page;

export const Colors: TempoStoryboard = {
  name: "Color Palette",
  render: () => <ColorPalette />,
  layout: { x: 0, y: 0, width: 1200, height: 900 },
};

export const Type: TempoStoryboard = {
  name: "Typography",
  render: () => <Typography />,
  layout: { x: 1250, y: 0, width: 1200, height: 800 },
};

export const UI: TempoStoryboard = {
  name: "Components",
  render: () => <Components />,
  layout: { x: 0, y: 950, width: 1200, height: 1100 },
};

export const Metrics: TempoStoryboard = {
  name: "Metric Cards",
  render: () => <MetricCards />,
  layout: { x: 1250, y: 950, width: 1200, height: 700 },
};

export const Response: TempoStoryboard = {
  name: "Response Card",
  render: () => <ResponseCard />,
  layout: { x: 1250, y: 1700, width: 1200, height: 800 },
};
