import type { TempoPage, TempoStoryboard, TempoRouteStoryboard } from 'tempo-sdk';
import Dashboardmockup from './DashboardMockup';

const page: TempoPage = {
  name: "Dashboard Preview",
};

export default page;

export const FullDashboard: TempoStoryboard = {
  render: () => <Dashboardmockup />,
  name: "Dashboard with Fixes",
  layout: { x: 0, y: 0, width: 1440, height: 1200 },
};
