import type { TempoPage, TempoStoryboard, TempoRouteStoryboard } from 'tempo-sdk';

const page: TempoPage = {
  name: "Blog Pages",
};

export default page;

export const BlogIndex: TempoRouteStoryboard = {
  route: "/blog",
  name: "Blog Index",
  layout: { x: 0, y: 0, width: 1200, height: 900 },
};

export const BlogPostGoogle: TempoRouteStoryboard = {
  route: "/blog/top-10-google-interview-questions",
  name: "Blog Post — Google",
  layout: { x: 1250, y: 0, width: 1200, height: 900 },
};

export const BlogPostTCS: TempoRouteStoryboard = {
  route: "/blog/tcs-interview-questions-freshers-2025",
  name: "Blog Post — TCS",
  layout: { x: 0, y: 950, width: 1200, height: 900 },
};
