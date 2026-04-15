import React from "react";
import { c } from "./tokens";

export const companyLogos: { name: string; svg: React.ReactNode }[] = [
  {
    name: "Google",
    svg: (
      <svg aria-hidden="true" width="74" height="24" viewBox="0 0 256 86" fill="currentColor">
        <path d="M34.8 43.7c0 12-9.4 20.8-20.9 20.8S-7 55.7-7 43.7c0-12.1 9.4-20.9 20.9-20.9s20.9 8.8 20.9 20.9zm-9.2 0c0-7.5-5.4-12.6-11.7-12.6S2.2 36.2 2.2 43.7c0 7.4 5.4 12.6 11.7 12.6s11.7-5.2 11.7-12.6z" transform="translate(7 0)"/>
        <path d="M73.4 43.7c0 12-9.4 20.8-20.9 20.8s-20.9-8.8-20.9-20.8c0-12.1 9.4-20.9 20.9-20.9S73.4 31.6 73.4 43.7zm-9.2 0c0-7.5-5.4-12.6-11.7-12.6S40.8 36.2 40.8 43.7c0 7.4 5.4 12.6 11.7 12.6s11.7-5.2 11.7-12.6z" transform="translate(7 0)"/>
        <path d="M110.6 24.1v37.8c0 15.6-9.2 21.9-20 21.9-10.2 0-16.4-6.8-18.7-12.4l8-3.3c1.4 3.4 4.9 7.5 10.7 7.5 7 0 11.3-4.3 11.3-12.5V60h-.3c-2.1 2.6-6.1 4.8-11.2 4.8-10.6 0-20.3-9.2-20.3-21.1 0-11.9 9.7-21.2 20.3-21.2 5 0 9.1 2.2 11.2 4.8h.3v-3.3h8.7zm-8 19.8c0-7.3-4.9-12.7-11.1-12.7-6.3 0-11.6 5.3-11.6 12.7 0 7.2 5.3 12.4 11.6 12.4 6.2.1 11.1-5.2 11.1-12.4z" transform="translate(7 0)"/>
        <path d="M121.8 3.8v59.6h-8.9V3.8h8.9z" transform="translate(7 0)"/>
        <path d="M155.2 51.3l6.9 4.6c-2.2 3.3-7.6 9-16.9 9-11.5 0-20.1-8.9-20.1-20.8 0-12.4 8.7-20.9 19.1-20.9 10.5 0 15.6 8.3 17.3 12.8l.9 2.3-27 11.2c2.1 4.1 5.3 6.1 9.8 6.1s7.7-2.2 10-5.3zm-21.2-7.5l18.1-7.5c-1-2.5-4-4.3-7.5-4.3-4.5 0-10.8 4-10.6 11.8z" transform="translate(7 0)"/>
        <path d="M170.4 63.4V3.8h14.2c10.6 0 19.5 7.4 19.5 18.2 0 10.8-8.9 18.2-19.5 18.2h-5.3v23.2h-8.9zm8.9-31.4h5.5c6.5 0 10.4-4.8 10.4-10.1 0-5.2-3.9-10-10.4-10h-5.5V32z" transform="translate(7 0)"/>
      </svg>
    ),
  },
  {
    name: "Amazon",
    svg: (
      <svg aria-hidden="true" width="74" height="22" viewBox="0 0 603 182" fill="currentColor">
        <path d="M374.1 142.3c-34.8 25.7-85.3 39.4-128.8 39.4-61 0-115.8-22.5-157.3-60-.3-.3-.3-7.5 3.3-3.3 44.8 36.4 100.1 58.3 157.3 58.3 38.6 0 81-8 120-24.5 5.9-2.5 10.8 3.8 5.5 10.1z"/>
        <path d="M389.6 125.5c-4.5-5.8-30-2.8-41.5-1.4-3.5.4-4-2.6-.9-4.8 20.3-14.3 53.6-10.2 57.5-5.4 3.9 4.9-1 38.8-20.1 55-2.9 2.5-5.7 1.2-4.4-2.1 4.3-10.7 13.9-35.5 9.4-41.3z"/>
        <path d="M349.3 23.5V7.2c0-2.5 1.9-4.1 4.1-4.1h72.8c2.3 0 4.2 1.7 4.2 4.1v14c0 2.3-2 5.3-5.4 10l-37.7 53.8c14-0.3 28.8 1.7 41.5 8.8 2.9 1.6 3.6 3.9 3.8 6.2v17.4c0 2.3-2.6 5.1-5.3 3.7-22.1-11.6-51.5-12.9-76 .1-2.5 1.3-5.1-1.4-5.1-3.7V100c0-2.6.1-7 2.6-10.9L389.7 36h-36.3c-2.3 0-4.1-1.7-4.1-4V23.5z"/>
        <path d="M124.1 107.6h-22.1c-2.1-.2-3.8-1.7-3.9-3.8V7.5c0-2.3 1.9-4.1 4.3-4.1h20.6c2.1.1 3.9 1.8 4 3.9V24h.4c5.4-14.7 15.5-21.5 29.1-21.5 13.8 0 22.5 6.8 28.7 21.5 5.4-14.7 17.6-21.5 30.6-21.5 9.3 0 19.4 3.8 25.6 12.4 7 9.6 5.6 23.5 5.6 35.7v53.2c0 2.3-1.9 4.2-4.3 4.2h-22c-2.2-.2-3.9-1.9-3.9-4.2V59.5c0-4.8.4-16.7-.6-21.2-1.7-7.6-6.8-9.7-13.4-9.7-5.5 0-11.3 3.7-13.6 9.6-2.3 5.9-2.1 15.8-2.1 21.3v44.3c0 2.3-1.9 4.2-4.3 4.2h-22c-2.2-.2-3.9-1.9-3.9-4.2l-.1-44.4c0-12.7 2.1-31.3-14-31.3-16.3 0-15.7 18.2-15.7 31.3v44.4c0 2.3-1.9 4.2-4.3 4.2z"/>
        <path d="M467.4 2.5c32.7 0 50.4 28.1 50.4 63.8 0 34.5-19.5 61.9-50.4 61.9-32.1 0-49.6-28.1-49.6-63 0-35 17.7-62.7 49.6-62.7zm.2 23.1c-16.2 0-17.2 22.1-17.2 35.9 0 13.8-.2 43.3 17 43.3 17 0 17.8-23.8 17.8-38.3 0-9.6-.4-21-3.3-30.1-2.5-7.9-7.5-10.8-14.3-10.8z"/>
        <path d="M554.6 107.6h-22c-2.2-.2-3.9-1.9-3.9-4.2l-.1-96.1c.2-2.1 2-3.8 4.3-3.8h20.5c1.9.1 3.5 1.5 3.9 3.3v14.7h.4c6.1-13.6 14.6-20 29.5-20 9.9 0 19.5 3.6 25.7 13.3 5.8 9.1 5.8 24.3 5.8 35.2v53.6c-.3 2-2.1 3.6-4.3 3.6h-22.2c-2-.2-3.7-1.7-3.9-3.6V57.6c0-12.4 1.4-30.5-14.2-30.5-5.5 0-10.6 3.7-13.1 9.3-3.2 7.1-3.6 14.2-3.6 21.2v46.2c-.1 2.3-2 4.2-4.4 4.2z"/>
        <path d="M296 61.3c0 8.7.2 16-4.2 23.7-3.5 6.3-9.1 10.2-15.3 10.2-8.5 0-13.5-6.5-13.5-16 0-18.9 16.9-22.3 33-22.3V61.3zM318.2 107.4c-1.4 1.3-3.5 1.4-5.1.5-7.2-6-8.5-8.7-12.4-14.4-11.9 12.1-20.3 15.7-35.7 15.7-18.2 0-32.4-11.3-32.4-33.8 0-17.6 9.5-29.6 23.1-35.5 11.8-5.2 28.2-6.1 40.8-7.6v-2.8c0-5.2.4-11.3-2.6-15.8-2.6-4-7.7-5.7-12.2-5.7-8.3 0-15.7 4.3-17.5 13.1-.4 2-1.8 3.9-3.8 4l-21.3-2.3c-1.8-.4-3.8-1.8-3.3-4.6C240.9 6.7 263.4 0 283.7 0c10.4 0 24 2.8 32.2 10.7 10.4 9.6 9.4 22.4 9.4 36.4v33c0 9.9 4.1 14.2 8 19.6 1.4 1.9 1.7 4.2-.1 5.6-4.4 3.7-12.3 10.6-16.6 14.4l-.4-.3z"/>
      </svg>
    ),
  },
  {
    name: "Microsoft",
    svg: (
      <svg aria-hidden="true" width="22" height="22" viewBox="0 0 256 256" fill="currentColor">
        <rect x="0" y="0" width="121.7" height="121.7" opacity="0.8"/>
        <rect x="134.3" y="0" width="121.7" height="121.7" opacity="0.6"/>
        <rect x="0" y="134.3" width="121.7" height="121.7" opacity="0.6"/>
        <rect x="134.3" y="134.3" width="121.7" height="121.7" opacity="0.4"/>
      </svg>
    ),
  },
  {
    name: "TCS",
    svg: (
      <svg aria-hidden="true" width="48" height="16" viewBox="0 0 80 24" fill="currentColor">
        <text x="0" y="18" fontFamily="'Inter', sans-serif" fontSize="17" fontWeight="700" letterSpacing="0.08em">TCS</text>
      </svg>
    ),
  },
  {
    name: "Flipkart",
    svg: (
      <svg aria-hidden="true" width="72" height="16" viewBox="0 0 140 24" fill="currentColor">
        <text x="0" y="18" fontFamily="'Inter', sans-serif" fontSize="17" fontWeight="600" letterSpacing="0.03em">Flipkart</text>
      </svg>
    ),
  },
  {
    name: "Meta",
    svg: (
      <svg aria-hidden="true" width="28" height="20" viewBox="0 0 256 171" fill="currentColor">
        <path d="M27.7 112.1c0 9.8 2.1 17.3 4.9 21.8 3.7 5.9 9.2 8.5 14.8 8.5 7.2 0 13.8-1.8 26.5-19.4 10.2-14.1 22.2-33.9 30.3-46.3L118 55.8c9.5-14.6 20.5-30.8 33.1-41.8C161.2 5 172.3 0 183.5 0c18.8 0 36.6 10.9 50.3 31.3 15 22.3 22.2 50.4 22.2 79.4 0 17.3-3.4 29.9-9.2 39.9-5.6 9.7-16.5 19.4-34.8 19.4v-27.6c15.7 0 19.6-14.4 19.6-30.9 0-23.5-5.5-49.6-17.6-68.3-8.6-13.2-19.7-21.3-31.9-21.3-13.2 0-23.9 10-35.8 27.8-6.4 9.4-12.9 21-20.2 34l-8.1 14.3C101.8 126.6 97.7 133.2 89.6 144c-14.2 18.9-26.3 26.1-42.3 26.1-18.9 0-30.9-8.2-38.3-20.6C2.97 139.4 0 126.2 0 111.1l27.7 1z"/>
      </svg>
    ),
  },
  {
    name: "Infosys",
    svg: (
      <svg aria-hidden="true" width="72" height="16" viewBox="0 0 140 24" fill="currentColor">
        <text x="0" y="18" fontFamily="'Inter', sans-serif" fontSize="17" fontWeight="600" letterSpacing="0.03em">Infosys</text>
      </svg>
    ),
  },
  {
    name: "Deloitte",
    svg: (
      <svg aria-hidden="true" width="72" height="16" viewBox="0 0 150 24" fill="currentColor">
        <text x="0" y="18" fontFamily="'Inter', sans-serif" fontSize="17" fontWeight="600" letterSpacing="0.04em">Deloitte</text>
        <circle cx="142" cy="16" r="4" fill="#86BC25" opacity="0.7"/>
      </svg>
    ),
  },
  {
    name: "Razorpay",
    svg: (
      <svg aria-hidden="true" width="80" height="16" viewBox="0 0 160 24" fill="currentColor">
        <text x="0" y="18" fontFamily="'Inter', sans-serif" fontSize="17" fontWeight="600" letterSpacing="0.03em">Razorpay</text>
      </svg>
    ),
  },
  {
    name: "McKinsey",
    svg: (
      <svg aria-hidden="true" width="90" height="16" viewBox="0 0 180 24" fill="currentColor">
        <text x="0" y="18" fontFamily="'Inter', sans-serif" fontSize="17" fontWeight="600" letterSpacing="0.06em">McKinsey</text>
      </svg>
    ),
  },
  {
    name: "Goldman Sachs",
    svg: (
      <svg aria-hidden="true" width="115" height="16" viewBox="0 0 220 24" fill="currentColor">
        <text x="0" y="18" fontFamily="'Inter', sans-serif" fontSize="17" fontWeight="600" letterSpacing="0.03em">Goldman Sachs</text>
      </svg>
    ),
  },
  {
    name: "Apple",
    svg: (
      <svg aria-hidden="true" width="20" height="24" viewBox="0 0 256 315" fill="currentColor">
        <path d="M213.8 167c.4 47.6 41.8 63.4 42.2 63.6-.3 1.1-6.6 22.6-21.8 44.7-13.1 19.2-26.7 38.3-48.1 38.7-21.1.4-27.8-12.5-51.9-12.5s-31.4 12.1-51.4 12.9c-20.7.8-36.5-20.7-49.7-39.8-27-39.4-47.6-111.4-19.9-159.9 13.8-24.1 38.3-39.3 65-39.7 20.3-.4 39.5 13.7 51.9 13.7 12.4 0 35.7-16.9 60.2-14.4 10.3.4 39.1 4.1 57.5 31.1-1.5.9-34.4 20.1-34 60.1M174.2 50.2c11-13.3 18.4-31.8 16.4-50.2-15.8.6-35 10.5-46.3 23.8-10.2 11.8-19 30.3-16.6 48.2 17.6 1.4 35.6-8.9 46.5-21.8"/>
      </svg>
    ),
  },
];

export const steps = [
  { number: "01", title: "Upload your resume", description: "Add your experience and target role. Our AI creates a personalized interview matched to your background and goals.", mockup: "upload" as const },
  { number: "02", title: "Practice in real time", description: "A conversational AI interviewer asks questions, listens, and follows up — just like a real interview at a top company.", mockup: "interview" as const },
  { number: "03", title: "Review scored feedback", description: "Get specific scores and actionable tips after every session. Know exactly what to improve before your real interview.", mockup: "feedback" as const },
];

export const features = [
  { label: "Adaptive", title: "Your resume becomes your questions", description: "No recycled question banks. The AI reads your resume, targets your specific role at your target company, and generates questions about YOUR projects and experience. Preparing for Flipkart? Different from TCS. Google? Different from Amazon.", accent: c.gilt, accentClass: "", icon: <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> },
  { label: "Real-Time", title: "An AI interviewer that actually listens", description: "Not pre-recorded questions. The AI responds to what you say — asking follow-ups, probing deeper, and challenging weak answers. Voice-based with real-time conversation, just like sitting across from a hiring manager.", accent: c.sage, accentClass: "accent-sage", icon: <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg> },
  { label: "Precise", title: "Brutally specific feedback", description: '"You forgot to mention the outcome — add the 40% improvement metric." Not vague advice like "try to be more specific." Every answer scored on communication, structure, and technical depth with actionable next steps.', accent: c.ember, accentClass: "accent-ember", icon: <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg> },
  { label: "Private", title: "Your data stays yours", description: "End-to-end encrypted storage. No social features. No employer access. No data selling. Only Vercel web vitals for site performance. Delete everything anytime from Settings.", accent: c.slate, accentClass: "accent-slate", icon: <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> },
];

export const testimonials = [
  { quote: "I was mass-applying and getting nowhere. After a week of practice on HireStepX, I started getting callbacks — and landed an offer at my top choice.", name: "Marcus T.", role: "Software Engineer", image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=500&fit=crop&crop=face&q=75", result: "Landed dream job at Google" },
  { quote: "Switching careers from teaching to product management felt impossible. The AI caught gaps I didn't know I had. Three weeks later, I had two offers.", name: "Dana R.", role: "Career Changer → PM", image: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400&h=500&fit=crop&crop=face&q=75", result: "Career switch success" },
  { quote: "The feedback was brutally specific — told me I was using filler words 15 times per answer. Fixed that, and my next interview felt completely different.", name: "Priya K.", role: "Data Analyst, Recent Grad", image: "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=400&h=500&fit=crop&crop=face&q=75", result: "First job out of college" },
  { quote: "My TCS NQT interview felt like a repeat of my practice sessions. The company-specific questions were spot on — I scored in the top 5% of my batch.", name: "Rahul M.", role: "B.Tech Final Year", image: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=400&h=500&fit=crop&crop=face&q=75", result: "Cracked TCS NQT, top 5%" },
  { quote: "I used to freeze during behavioral questions. After 12 sessions, my STAR responses became second nature. Got promoted to Senior Engineer within 3 months of switching.", name: "Aisha J.", role: "Senior Software Engineer", image: "https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=400&h=500&fit=crop&crop=face&q=75", result: "Senior role at Flipkart" },
  { quote: "The skill radar showed me I was strong on communication but weak on specificity. Two focused sessions later, my scores jumped 20 points. Data-driven prep actually works.", name: "Vikram S.", role: "Product Manager", image: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400&h=500&fit=crop&crop=face&q=75", result: "Offer from Razorpay" },
  { quote: "As a non-CS graduate, I was terrified of technical interviews. HireStepX adapted to my level and helped me build confidence one session at a time. Now I'm at Deloitte.", name: "Sneha P.", role: "Business Analyst", image: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400&h=500&fit=crop&crop=face&q=75", result: "Landed role at Deloitte" },
];

export const plans = [
  { name: "Free", price: "Free", period: "", planId: "", description: "Try it out — no credit card required.", features: ["3 AI mock interviews", "Behavioral questions only", "Basic score & feedback"], cta: "Start Free", featured: false },
  { name: "Single Session", price: "₹10", period: "/ session", planId: "single", description: "Pay per interview. No commitment.", features: ["All question types", "Detailed score & tips", "Ideal answer key", "Company-specific questions"], cta: "Buy Session", featured: false },
  { name: "Starter", price: "₹49", period: "/ week", planId: "weekly", description: "7 sessions per week. Cancel anytime.", features: ["7 sessions per week", "All types + role-specific", "Skill-level breakdown", "Resume-tailored questions", "PDF reports"], cta: "Get Started", featured: false },
  { name: "Pro", price: "₹149", period: "/ month", planId: "monthly", description: "Best value for serious prep. Cancel anytime.", features: ["30 sessions per month", "Everything in Starter", "AI coaching & improvement plan", "Performance analytics & trends", "Interview calendar", "Export PDF, CSV, JSON"], cta: "Go Pro", featured: true },
  { name: "Annual", price: "₹1,199", period: "/ year", planId: "annual", description: "Save 33% — just ₹100/month. Best for long-term prep.", features: ["Everything in Pro", "Unlimited sessions", "Priority AI model", "Dedicated support", "Early access to new features"], cta: "Save 33%", featured: false },
];

export const LANDING_FAQS = [
  { question: "Is HireStepX free to use?", answer: "Yes. Start with 3 full AI mock interviews — complete with real-time feedback, scores, and detailed performance reports. No credit card required. After that, single sessions cost just ₹10 (less than a cup of chai), or go unlimited with our Pro plan at ₹149/month." },
  { question: "How does the AI mock interview work?", answer: "Upload your resume, pick your target company and role, and choose from 10 interview types. The AI interviewer asks role-specific questions via voice, listens to your answers, asks follow-up questions based on what you said, and delivers scored feedback with specific improvement tips after each session." },
  { question: "What types of interviews can I practice?", answer: "10 types: Behavioral, Technical, Strategic, Case Study, Campus Placement, HR Round, Panel, Management, Salary Negotiation, and Government/PSU. Each with 3 difficulty levels (Warmup, Standard, Intense) and mini (10 min) or full (25 min) session options." },
  { question: "Can I practice for specific companies like TCS, Infosys, or Google?", answer: "Absolutely. We support 50+ target companies including Google, Amazon, TCS, Infosys, Flipkart, Razorpay, McKinsey, Deloitte, and more. Each company has distinct interview patterns — TCS NQT questions are nothing like Google system design rounds, and our AI knows the difference." },
  { question: "How is this different from ChatGPT or practicing with friends?", answer: "ChatGPT is text-only with no voice, no scoring, no resume integration, and no progress tracking. Friends aren't trained interviewers — they can't score you consistently or simulate company-specific formats. HireStepX is a purpose-built interview simulator: voice-based, resume-personalized, with detailed analytics and improvement tracking over time." },
  { question: "Is my interview data private and secure?", answer: "Yes. Data is encrypted via Supabase with row-level security. Recordings and transcripts are never shared with employers or third parties. There are no social features — your practice is completely private. Delete everything anytime from Settings." },
  { question: "Does it work in Hindi?", answer: "Yes. HireStepX supports English, Hindi, and Hinglish. The AI interviews and evaluates you in your selected language, so you can practice in whatever language your actual interview will be in." },
  { question: "How much does it cost compared to a career coach?", answer: "A single coaching session typically costs ₹3,000-10,000. HireStepX is ₹10 per session, or ₹149/month for 30 sessions with full AI coaching and analytics. That's ₹5/day for the complete prep toolkit — and the AI is available 24/7, not just during office hours." },
];
