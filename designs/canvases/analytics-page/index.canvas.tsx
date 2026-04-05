import type { TempoPage, TempoStoryboard, TempoRouteStoryboard } from 'tempo-sdk';

const page: TempoPage = {
  name: "Analytics Page",
};

export default page;

export const FullAnalytics: TempoRouteStoryboard = {
  route: "/analytics",
  name: "Full Analytics View",
  layout: { x: 0, y: 0, width: 1280, height: 2400 },
};

export const EmptyState: TempoRouteStoryboard = {
  route: "/analytics",
  name: "Empty State (No Sessions)",
  layout: { x: 1330, y: 0, width: 800, height: 600 },
};
