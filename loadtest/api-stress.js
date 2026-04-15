import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const questionGenTime = new Trend('question_gen_time');
const evaluationTime = new Trend('evaluation_time');
const tokenTime = new Trend('token_time');

export const options = {
  scenarios: {
    // Smoke test: 1 user, quick sanity check
    smoke: {
      executor: 'constant-vus',
      vus: 1,
      duration: '30s',
      tags: { scenario: 'smoke' },
    },
    // Load test: ramp to 50 concurrent users
    load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 20 },
        { duration: '2m', target: 50 },
        { duration: '1m', target: 50 },
        { duration: '30s', target: 0 },
      ],
      startTime: '35s', // start after smoke
      tags: { scenario: 'load' },
    },
    // Spike test: sudden burst
    spike: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 100 },
        { duration: '30s', target: 100 },
        { duration: '10s', target: 0 },
      ],
      startTime: '5m',
      tags: { scenario: 'spike' },
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<5000'],     // 95th percentile under 5s
    http_req_failed: ['rate<0.1'],          // Less than 10% errors
    errors: ['rate<0.1'],                   // Custom error rate
    question_gen_time: ['p(95)<10000'],     // Question gen under 10s at p95
    evaluation_time: ['p(95)<30000'],       // Evaluation under 30s at p95
    token_time: ['p(95)<1000'],             // Token endpoints under 1s
  },
};

/* global __ENV */
const BASE_URL = __ENV.BASE_URL || 'https://hirestepx.com';

// Test data
const INTERVIEW_TYPES = ['behavioral', 'technical', 'strategic', 'case-study', 'campus-placement', 'hr-round', 'panel', 'management', 'salary-negotiation', 'government-psu'];
const DIFFICULTIES = ['warmup', 'standard', 'intense'];
const ROLES = ['Software Engineer', 'Product Manager', 'Data Analyst', 'DevOps Engineer', 'Frontend Developer'];
const COMPANIES = ['Google', 'TCS', 'Flipkart', 'Amazon', 'Infosys', 'Razorpay'];

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export default function () {
  const headers = { 'Content-Type': 'application/json' };

  group('Token Endpoints', () => {
    // STT token
    const sttRes = http.post(`${BASE_URL}/api/stt-token`, '{}', { headers, tags: { endpoint: 'stt-token' } });
    check(sttRes, { 'stt-token status': (r) => r.status === 200 || r.status === 401 || r.status === 429 });
    tokenTime.add(sttRes.timings.duration);
    errorRate.add(sttRes.status >= 500);

    // TTS token
    const ttsRes = http.post(`${BASE_URL}/api/tts-token`, '{}', { headers, tags: { endpoint: 'tts-token' } });
    check(ttsRes, { 'tts-token status': (r) => r.status === 200 || r.status === 401 || r.status === 429 });
    tokenTime.add(ttsRes.timings.duration);
    errorRate.add(ttsRes.status >= 500);
  });

  sleep(0.5);

  group('Question Generation', () => {
    const payload = JSON.stringify({
      type: randomItem(INTERVIEW_TYPES),
      difficulty: randomItem(DIFFICULTIES),
      role: randomItem(ROLES),
      company: randomItem(COMPANIES),
      mini: Math.random() > 0.5,
    });

    const res = http.post(`${BASE_URL}/api/generate-questions`, payload, {
      headers,
      tags: { endpoint: 'generate-questions' },
      timeout: '15s',
    });
    check(res, {
      'questions status': (r) => r.status === 200 || r.status === 401 || r.status === 429,
      'questions has body': (r) => r.body && r.body.length > 0,
    });
    questionGenTime.add(res.timings.duration);
    errorRate.add(res.status >= 500);
  });

  sleep(1);

  group('Evaluation', () => {
    const transcript = [
      { speaker: 'ai', text: 'Tell me about a challenging project you worked on.' },
      { speaker: 'user', text: 'I led the migration of our monolithic architecture to microservices at my previous company. The project involved 15 services, took 6 months, and reduced deployment time by 40%. I coordinated with 3 teams and managed the rollout strategy.' },
      { speaker: 'ai', text: 'How did you handle disagreements during the migration?' },
      { speaker: 'user', text: 'There was significant pushback from the database team about splitting the shared database. I organized a series of workshops to address concerns, created a proof of concept, and we eventually agreed on an event-driven approach.' },
    ];

    const payload = JSON.stringify({
      transcript,
      type: randomItem(INTERVIEW_TYPES),
      difficulty: randomItem(DIFFICULTIES),
      role: randomItem(ROLES),
      company: randomItem(COMPANIES),
    });

    const res = http.post(`${BASE_URL}/api/evaluate`, payload, {
      headers,
      tags: { endpoint: 'evaluate' },
      timeout: '35s',
    });
    check(res, {
      'evaluate status': (r) => r.status === 200 || r.status === 401 || r.status === 429,
      'evaluate has score': (r) => {
        if (r.status !== 200) return true; // skip for non-200
        try { const b = JSON.parse(r.body); return typeof b.overallScore === 'number'; } catch { return false; }
      },
    });
    evaluationTime.add(res.timings.duration);
    errorRate.add(res.status >= 500);
  });

  sleep(1);

  group('Follow-up', () => {
    const payload = JSON.stringify({
      question: 'Tell me about a leadership challenge.',
      answer: 'I managed a team of 8 engineers through a product pivot. We had to rebuild the core feature in 3 months.',
      type: randomItem(INTERVIEW_TYPES),
      role: randomItem(ROLES),
    });

    const res = http.post(`${BASE_URL}/api/follow-up`, payload, {
      headers,
      tags: { endpoint: 'follow-up' },
      timeout: '5s',
    });
    check(res, {
      'follow-up status': (r) => r.status === 200 || r.status === 401 || r.status === 429,
    });
    errorRate.add(res.status >= 500);
  });

  sleep(0.5);

  group('Static Assets', () => {
    const landingRes = http.get(`${BASE_URL}/`, { tags: { endpoint: 'landing' } });
    check(landingRes, {
      'landing loads': (r) => r.status === 200,
      'landing has content': (r) => r.body && r.body.includes('HireStepX'),
    });
    errorRate.add(landingRes.status >= 500);
  });

  sleep(Math.random() * 2);
}

export function handleSummary(data) {
  const now = new Date().toISOString().split('T')[0];
  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    [`loadtest/results/report-${now}.json`]: JSON.stringify(data, null, 2),
  };
}

// Import textSummary helper
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.1/index.js';
