import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { c, font } from "./tokens";
import { useAuth } from "./AuthContext";
import { extractResumeText, parseResumeData, type ParsedResume } from "./resumeParser";
import { analyzeResumeWithAI, type ResumeProfile } from "./dashboardData";
import { unlockAudio } from "./tts";
import { UpgradeModal } from "./dashboardComponents";
import { track } from "@vercel/analytics";

const TOTAL_STEPS = 3;

/* ─── Suggestion data (India-focused) ─── */
const ROLE_SUGGESTIONS = [
  // Software Engineering
  "Software Engineer", "Senior Software Engineer", "Staff Engineer", "Principal Engineer", "Lead Software Engineer",
  "Software Developer", "Senior Software Developer", "Application Developer", "Systems Engineer",
  "Frontend Developer", "Senior Frontend Developer", "React Developer", "Angular Developer", "Vue.js Developer",
  "Backend Developer", "Senior Backend Developer", "Java Developer", "Python Developer", "Node.js Developer", "Go Developer", ".NET Developer",
  "Full Stack Developer", "Senior Full Stack Developer", "MERN Stack Developer", "MEAN Stack Developer",
  "Mobile Developer", "iOS Developer", "Android Developer", "React Native Developer", "Flutter Developer",
  "Embedded Software Engineer", "Firmware Engineer", "C++ Developer", "Rust Developer",
  // DevOps & Cloud
  "DevOps Engineer", "Senior DevOps Engineer", "Site Reliability Engineer", "Cloud Engineer", "Cloud Architect",
  "Platform Engineer", "Infrastructure Engineer", "Network Engineer", "Systems Administrator",
  "Kubernetes Engineer", "AWS Solutions Architect", "Azure Engineer",
  // Data & AI/ML
  "Data Engineer", "Senior Data Engineer", "Data Architect",
  "Data Scientist", "Senior Data Scientist", "Research Scientist",
  "Data Analyst", "Senior Data Analyst", "Business Intelligence Analyst", "BI Developer", "MIS Executive",
  "Machine Learning Engineer", "Senior ML Engineer", "AI Engineer", "AI/ML Lead", "NLP Engineer", "Computer Vision Engineer",
  "MLOps Engineer", "AI Product Manager",
  // QA & Testing
  "QA Engineer", "Senior QA Engineer", "QA Lead", "Test Engineer", "SDET", "Automation Engineer", "Performance Engineer",
  "QA Manager", "Test Architect",
  // Security
  "Security Engineer", "Cybersecurity Analyst", "SOC Analyst", "Penetration Tester", "Security Architect", "CISO",
  // Engineering Leadership
  "Tech Lead", "Engineering Manager", "Senior Engineering Manager", "Director of Engineering",
  "VP of Engineering", "Head of Engineering", "CTO", "Co-founder & CTO",
  // Product
  "Associate Product Manager", "Product Manager", "Senior Product Manager", "Lead Product Manager",
  "Group Product Manager", "Director of Product", "VP of Product", "Head of Product", "Chief Product Officer",
  "Technical Product Manager", "Product Owner", "Product Analyst", "Growth Product Manager",
  // Design
  "Product Designer", "Senior Product Designer", "UX Designer", "Senior UX Designer", "UI Designer", "UX/UI Designer",
  "UX Researcher", "Visual Designer", "Motion Designer", "Graphic Designer",
  "Head of Design", "Design Manager", "Design Director",
  // Business Analysis & Consulting
  "Business Analyst", "Senior Business Analyst", "Management Consultant", "Strategy Consultant", "Technology Consultant",
  "SAP Consultant", "Salesforce Consultant", "ERP Consultant", "Functional Consultant", "Domain Consultant",
  // Project & Program Management
  "Project Manager", "Senior Project Manager", "Program Manager", "Technical Program Manager",
  "Scrum Master", "Agile Coach", "Delivery Manager", "Engagement Manager", "Client Partner",
  // Operations & Supply Chain
  "Operations Manager", "Operations Analyst", "Supply Chain Manager", "Logistics Manager",
  "Procurement Manager", "Warehouse Manager", "Planning Manager", "Category Manager",
  // Marketing
  "Marketing Manager", "Digital Marketing Manager", "Performance Marketing Manager",
  "Growth Manager", "Content Strategist", "Content Writer", "Copywriter",
  "SEO Specialist", "SEM Specialist", "Social Media Manager", "Brand Manager",
  "VP of Marketing", "Head of Growth", "Chief Marketing Officer",
  // Sales & BD
  "Sales Executive", "Senior Sales Executive", "Account Executive",
  "Sales Manager", "Regional Sales Manager", "Area Sales Manager", "Zonal Sales Manager",
  "Business Development Manager", "Business Development Executive", "BD Lead",
  "Key Account Manager", "Enterprise Sales Manager", "Inside Sales Representative",
  "Customer Success Manager", "Account Manager", "Solutions Architect", "Pre-Sales Consultant",
  "VP of Sales", "Head of Sales", "Chief Revenue Officer",
  // HR & People
  "HR Executive", "HR Manager", "Senior HR Manager", "HR Business Partner",
  "Recruiter", "Technical Recruiter", "Talent Acquisition Lead", "Talent Acquisition Manager",
  "L&D Manager", "Training Manager", "Compensation & Benefits Manager", "People Operations Manager",
  "Head of HR", "VP of People", "CHRO",
  // Finance & Accounting
  "CA", "Chartered Accountant", "CA Inter", "CA Articleship",
  "Financial Analyst", "Senior Financial Analyst", "Investment Analyst", "Investment Banking Analyst",
  "Auditor", "Internal Auditor", "Statutory Auditor", "Tax Consultant", "GST Consultant",
  "Accounts Executive", "Accounts Manager", "FP&A Analyst", "Treasury Analyst",
  "Risk Analyst", "Credit Analyst", "Compliance Officer",
  "Finance Manager", "Finance Controller", "VP of Finance", "CFO",
  // Banking & Insurance
  "Bank PO", "Bank Clerk", "Relationship Manager", "Branch Manager", "Wealth Manager",
  "Credit Manager", "Loan Officer", "Underwriter", "Claims Manager",
  "Insurance Agent", "Actuarial Analyst",
  // Legal
  "Legal Counsel", "Corporate Lawyer", "Legal Associate", "Company Secretary", "CS", "Compliance Manager",
  // Government & PSU
  "IAS Officer", "IPS Officer", "IFS Officer", "UPSC Aspirant",
  "SSC CGL", "Bank PO (IBPS/SBI)", "RBI Grade B", "SEBI Grade A",
  "PSU Engineer", "GATE Qualified Engineer", "Government Scientist",
  // Teaching & Education
  "Teacher", "Lecturer", "Assistant Professor", "Professor",
  "Academic Coordinator", "Principal", "Education Counselor", "Curriculum Designer",
  "Corporate Trainer", "Subject Matter Expert",
  // Healthcare
  "Doctor", "MBBS", "MD", "Surgeon", "Dentist",
  "Pharmacist", "Medical Representative", "Clinical Research Associate",
  "Hospital Administrator", "Healthcare Manager",
  // Civil & Mechanical Engineering
  "Civil Engineer", "Site Engineer", "Structural Engineer", "Construction Manager",
  "Mechanical Engineer", "Design Engineer", "Manufacturing Engineer", "Production Manager",
  "Quality Engineer", "Quality Manager", "Six Sigma Black Belt",
  // Electrical & Electronics
  "Electrical Engineer", "Electronics Engineer", "VLSI Engineer", "Chip Design Engineer",
  "Control Systems Engineer", "Power Systems Engineer", "Instrumentation Engineer",
  // Media & Content
  "Journalist", "Editor", "Content Creator", "Video Editor", "Social Media Influencer",
  "Public Relations Manager", "Corporate Communications Manager",
  // Executive Leadership
  "CEO", "Co-founder", "Managing Director", "General Manager", "Chief of Staff", "COO",
  // Entry Level & Freshers
  "Software Engineer Intern", "Data Science Intern", "Product Intern", "Design Intern", "Marketing Intern",
  "Associate Software Engineer", "Junior Developer", "Junior Data Analyst",
  "Graduate Engineer Trainee (GET)", "Management Trainee", "Fresher", "Campus Hire",
  "Apprentice", "Trainee Engineer",
  // Freelance & Contract
  "Freelance Developer", "Freelance Designer", "Independent Consultant", "Contract Engineer",
];

const COMPANY_SUGGESTIONS = [
  // Global Tech (with India offices)
  "Google", "Microsoft", "Amazon", "Meta", "Apple", "Netflix",
  "Adobe", "Oracle", "SAP", "Salesforce", "ServiceNow", "Intuit", "Atlassian",
  "IBM", "Cisco", "Intel", "NVIDIA", "Qualcomm", "Samsung", "Dell Technologies", "HP", "VMware", "Lenovo",
  "LinkedIn", "Uber", "Spotify", "Twitter (X)", "Airbnb", "Shopify",
  "Snowflake", "Databricks", "MongoDB", "Elastic", "Cloudflare", "Datadog", "HashiCorp",
  "Stripe", "PayPal", "Visa", "Mastercard",
  "GitHub", "GitLab", "JetBrains", "Figma", "Notion", "Twilio",
  "OpenAI", "Anthropic", "Google DeepMind", "Scale AI",
  "Goldman Sachs", "JP Morgan", "Morgan Stanley", "Deutsche Bank", "Barclays", "Citi", "HSBC", "UBS", "Credit Suisse",
  "BlackRock", "Two Sigma", "Citadel", "Jane Street", "DE Shaw", "Tower Research Capital", "WorldQuant",
  // Indian IT Services & Consulting
  "TCS", "Infosys", "Wipro", "HCL Technologies", "Tech Mahindra", "LTIMindtree",
  "Persistent Systems", "Mphasis", "Coforge", "L&T Technology Services", "Cyient", "KPIT Technologies",
  "Mindtree", "Hexaware", "Zensar Technologies", "Sonata Software", "Birlasoft", "NIIT Technologies",
  "Cognizant", "Capgemini", "Accenture", "Deloitte", "PwC", "EY", "KPMG",
  "ThoughtWorks", "Publicis Sapient", "Mu Sigma", "Fractal Analytics", "Tiger Analytics", "AbsolutData",
  "Happiest Minds", "Mphasis", "iGate", "Sasken Technologies", "Tata Elxsi", "Amdocs",
  // Indian Startups — E-commerce & Consumer
  "Flipkart", "Myntra", "Meesho", "Nykaa", "Lenskart", "FirstCry", "Purplle",
  "BigBasket", "Blinkit", "JioMart", "Swiggy Instamart", "Zepto", "BlinkIt",
  "Mamaearth", "boAt", "Sugar Cosmetics", "Bewakoof", "Licious", "Country Delight",
  // Indian Startups — Food & Delivery
  "Swiggy", "Zomato", "Dunzo", "EatSure (Rebel Foods)", "Box8", "FreshMenu",
  // Indian Startups — Fintech
  "Razorpay", "PhonePe", "Paytm", "CRED", "Zerodha", "Groww",
  "Slice", "Jupiter", "Fi Money", "Uni Cards", "KreditBee", "Lendingkart",
  "INDmoney", "Smallcase", "Niyo", "Open Financial", "Cashfree", "Instamojo",
  "BharatPe", "MobiKwik", "Freecharge", "LazyPay", "ZestMoney", "Rupeek",
  "Pine Labs", "Mswipe", "Razorpay POS", "PayU", "Juspay", "Simpl",
  "Paytm Money", "Upstox", "Angel One", "5paisa", "Motilal Oswal",
  // Indian Startups — Mobility & Logistics
  "Ola", "Rapido", "Uber India", "BluSmart",
  "Ather Energy", "Ola Electric", "Revolt Motors", "Yulu", "Bounce",
  "Delhivery", "Shiprocket", "Ecom Express", "XpressBees", "Shadowfax", "Porter", "Rivigo",
  "BlackBuck", "Vahak", "Blowhorn",
  // Indian Startups — EdTech
  "Byju's", "Unacademy", "upGrad", "Physics Wallah", "Vedantu", "Scaler",
  "Simplilearn", "Great Learning", "WhiteHat Jr", "Toppr", "Doubtnut",
  "Allen Digital", "Testbook", "Adda247", "Gradeup", "PrepLadder",
  // Indian Startups — HealthTech
  "Practo", "PharmEasy", "Tata 1mg", "NetMeds", "MFine", "Pristyn Care",
  "HealthifyMe", "CureFit (cult.fit)", "Innovaccer", "Niramai", "mfine",
  // Indian Startups — SaaS & Dev Tools
  "Freshworks", "Zoho", "Postman", "BrowserStack", "Chargebee", "Druva", "Icertis",
  "CleverTap", "WebEngage", "MoEngage", "Haptik", "Yellow.ai", "Gupshup",
  "Leadsquared", "Whatfix", "Mindtickle", "Darwinbox", "GreyTip", "Keka HR",
  "Razorpay (SaaS)", "Uniphore", "Observe.AI", "Hasura", "Appsmith", "ToolJet",
  "InMobi", "Glance", "Apna", "Pratilipi", "Koo",
  // Indian Startups — Social & Media
  "ShareChat", "Dailyhunt", "Josh", "Kuku FM", "Pocket FM",
  // Indian Startups — Real Estate & PropTech
  "Housing.com", "99acres", "MagicBricks", "NoBroker", "Square Yards",
  "Lodha Group", "Prestige Group", "Godrej Properties", "Sobha",
  // Indian Startups — Travel & Hospitality
  "MakeMyTrip", "Goibibo", "OYO Rooms", "Yatra", "Cleartrip",
  "EaseMyTrip", "ixigo", "RedBus", "Treebo", "FabHotels",
  // Indian Startups — Insurance
  "PolicyBazaar", "Acko", "Digit Insurance", "Star Health", "Turtlemint", "Plum",
  // Indian Startups — Auto & Classifieds
  "Cars24", "CarDekho", "Spinny", "Droom", "CarTrade", "OLX India", "Quikr",
  // Indian Banks
  "State Bank of India (SBI)", "HDFC Bank", "ICICI Bank", "Kotak Mahindra Bank", "Axis Bank",
  "Punjab National Bank", "Bank of Baroda", "Canara Bank", "Union Bank", "Indian Bank",
  "Yes Bank", "IndusInd Bank", "Federal Bank", "RBL Bank", "IDFC First Bank", "Bandhan Bank",
  "South Indian Bank", "City Union Bank", "Karur Vysya Bank", "DCB Bank",
  // NBFCs & Financial Services
  "Bajaj Finance", "Bajaj Finserv", "HDFC Ltd", "L&T Finance", "Shriram Finance",
  "Muthoot Finance", "Manappuram Finance", "Mahindra Finance", "IIFL Finance",
  "HDFC Life", "ICICI Prudential", "SBI Life", "Max Life", "Tata AIA",
  "HDFC AMC", "ICICI Prudential AMC", "SBI Mutual Fund", "Nippon India AMC", "Kotak AMC",
  // Stock Exchanges & Regulators
  "NSE", "BSE", "SEBI", "RBI", "IRDAI", "NABARD", "SIDBI",
  "NSDL", "CDSL", "CRISIL", "ICRA", "CARE Ratings",
  // Consulting (India presence)
  "McKinsey", "BCG", "Bain", "Deloitte", "Accenture", "PwC", "EY", "KPMG",
  "Oliver Wyman", "ZS Associates", "Strategy&", "Kearney", "Roland Berger",
  "Alvarez & Marsal", "Grant Thornton", "BDO India",
  // Pharma & Healthcare Companies
  "Sun Pharma", "Dr. Reddy's", "Cipla", "Lupin", "Aurobindo Pharma", "Biocon",
  "Divis Labs", "Torrent Pharma", "Zydus Lifesciences", "Glenmark", "Alkem Labs",
  "Mankind Pharma", "Ipca Labs", "Natco Pharma", "Piramal Pharma",
  "Pfizer India", "Novartis India", "AstraZeneca India", "Abbott India", "GSK India",
  // FMCG
  "Hindustan Unilever (HUL)", "ITC", "Nestle India", "P&G India", "Colgate-Palmolive India",
  "Dabur", "Marico", "Godrej Consumer Products", "Emami", "Britannia",
  "Parle Products", "Amul (GCMMF)", "Haldiram's", "Tata Consumer Products",
  "Patanjali", "Bisleri", "Paperboat", "Raw Pressery",
  // Telecom
  "Jio (Reliance)", "Airtel (Bharti)", "Vodafone Idea", "BSNL", "MTNL",
  "Jio Platforms", "Airtel Digital", "Tata Communications",
  // Automotive
  "Tata Motors", "Mahindra & Mahindra", "Maruti Suzuki", "Hyundai India", "Kia India",
  "Hero MotoCorp", "Bajaj Auto", "TVS Motor", "Royal Enfield (Eicher)",
  "Ashok Leyland", "Force Motors", "MG Motor India", "Skoda-VW India",
  "Toyota India", "Honda India", "Mercedes-Benz India", "BMW India", "Audi India",
  "Tata Technologies", "KPIT Technologies", "Bosch India", "Continental India",
  // Conglomerates
  "Tata Group", "Reliance Industries", "Adani Group", "Mahindra Group",
  "Godrej Group", "Aditya Birla Group", "Bharti Enterprises", "Vedanta", "JSW Group",
  "L&T (Larsen & Toubro)", "BHEL", "ONGC", "NTPC", "Indian Oil (IOCL)",
  "GAIL", "BPCL", "HPCL", "Coal India", "Power Grid", "SAIL",
  // Defence & Aerospace
  "HAL", "BEL", "DRDO", "ISRO", "BDL", "BEML",
  // Media & Entertainment
  "Star India (Disney+Hotstar)", "Sony India", "Zee Entertainment", "Viacom18",
  "Times Group", "HT Media", "NDTV", "Network18",
  "T-Series", "Yash Raj Films", "Dharma Productions",
  // E-commerce & Retail (India)
  "Amazon India", "Flipkart", "Reliance Retail", "Tata CLiQ", "Snapdeal",
  "DMart (Avenue Supermarts)", "Reliance Trends", "Shoppers Stop", "Lifestyle",
  "Decathlon India", "IKEA India", "H&M India", "Zara India",
  "Croma", "Vijay Sales", "Poorvika",
  // Startup Stages
  "Pre-seed / Seed Startup", "Series A Startup", "Series B Startup", "Series C+ Startup",
  "Bootstrapped Startup", "Enterprise / MNC", "Government / PSU",
];

/* Sample diverse suggestions by picking evenly spaced items */
function sampleDiverse(arr: string[], count: number): string[] {
  if (arr.length <= count) return arr;
  const step = Math.floor(arr.length / count);
  const result: string[] = [];
  for (let i = 0; i < count; i++) result.push(arr[i * step]);
  return result;
}

/* ─── Autocomplete Input Component ─── */
function AutocompleteInput({
  id, value, onChange, placeholder, suggestions, label, required, error,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  suggestions: string[];
  label?: string;
  required?: boolean;
  error?: string;
}) {
  const [focused, setFocused] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);
  // Stable diverse sample for empty-state (computed once)
  const [diverseSample] = useState(() => sampleDiverse(suggestions, 8));

  // Cleanup: set focused to false on unmount
  useEffect(() => {
    return () => { setFocused(false); };
  }, []);
  const filtered = focused
    ? value.length > 0
      ? suggestions.filter(s => s.toLowerCase().includes(value.toLowerCase()) && s.toLowerCase() !== value.toLowerCase()).slice(0, 8)
      : diverseSample // Show diverse suggestions from across categories
    : [];

  // Update dropdown position when filtered results change or input is focused
  useEffect(() => {
    if (filtered.length > 0 && inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    }
  }, [filtered.length, focused, value]);

  return (
    <div>
      {label && (
        <label htmlFor={id} style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 500, color: c.chalk, display: "block", marginBottom: 8 }}>
          {label} {required && <span style={{ color: c.ember }}>*</span>}
        </label>
      )}
      <input
        ref={inputRef}
        id={id} type="text" value={value}
        onChange={(e) => { onChange(e.target.value); setSelectedIdx(-1); }}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        onKeyDown={(e) => {
          if (filtered.length === 0) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIdx(i => Math.min(i + 1, filtered.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIdx(i => Math.max(i - 1, 0)); }
          else if (e.key === "Enter" && selectedIdx >= 0) { e.preventDefault(); onChange(filtered[selectedIdx]); setFocused(false); }
        }}
        placeholder={placeholder}
        autoComplete="off"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        style={{
          width: "100%", padding: "12px 16px", borderRadius: 10,
          background: c.graphite, border: `1.5px solid ${error ? c.ember : focused ? c.gilt : c.border}`,
          color: c.ivory, fontFamily: font.ui, fontSize: 14,
          outline: "none", transition: "border-color 0.2s", boxSizing: "border-box",
        }}
      />
      {error && <p id={`${id}-error`} role="alert" style={{ fontFamily: font.ui, fontSize: 11, color: c.ember, marginTop: 4 }}>{error}</p>}
      {filtered.length > 0 && dropdownPos && createPortal(
        <div role="listbox" style={{
          position: "fixed", top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width, zIndex: 9999,
          background: c.graphite, border: `1px solid ${c.border}`, borderRadius: 10,
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)", maxHeight: 220, overflowY: "auto",
        }}>
          {filtered.map((s, i) => (
            <button key={s} role="option" aria-selected={i === selectedIdx} onMouseDown={() => { onChange(s); setFocused(false); }}
              style={{
                display: "block", width: "100%", padding: "10px 16px", border: "none", textAlign: "left",
                fontFamily: font.ui, fontSize: 13, cursor: "pointer",
                background: i === selectedIdx ? "rgba(212,179,127,0.08)" : "transparent",
                color: i === selectedIdx ? c.ivory : c.chalk,
              }}>
              {s}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

const OB_STEP_KEY = "hirestepx_ob_step";
const OB_FORM_KEY = "hirestepx_ob_form";
function saveObStep(step: number) { try { localStorage.setItem(OB_STEP_KEY, String(step)); } catch {} }
function loadObStep(): number { try { const v = localStorage.getItem(OB_STEP_KEY); return v ? Math.min(Math.max(parseInt(v), 1), TOTAL_STEPS) : 1; } catch { return 1; } }
function clearObStep() { try { localStorage.removeItem(OB_STEP_KEY); localStorage.removeItem(OB_FORM_KEY); } catch {} }
function saveObForm(data: { targetRole: string; targetCompany: string; interviewFocus: string[]; sessionLength: string }) {
  try { localStorage.setItem(OB_FORM_KEY, JSON.stringify(data)); } catch {}
}
function loadObForm(): { targetRole: string; targetCompany: string; interviewFocus: string[]; sessionLength: string } | null {
  try { const raw = localStorage.getItem(OB_FORM_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}

const SESSION_LENGTH_MAP: Record<string, 10 | 15 | 25> = { "10m": 10, "15m": 15, "25m": 25 };

export default function Onboarding() {
  const navigate = useNavigate();
  const { user, updateUser } = useAuth();

  // Redirect returning users who already completed onboarding (but not during active start)
  const startingRef = useRef(false);
  useEffect(() => {
    if (user?.hasCompletedOnboarding && !startingRef.current) navigate("/dashboard", { replace: true });
  }, [user?.hasCompletedOnboarding, navigate]);

  const [step, setStep] = useState(loadObStep);
  const [slideDir, setSlideDir] = useState<"forward" | "back">("forward");

  // ─── Step 1: Resume ───
  const [fileName, setFileName] = useState("");
  const [resumeText, setResumeText] = useState("");
  const [resumeParsed, setResumeParsed] = useState<ParsedResume | null>(null);
  const [resumeParsing, setResumeParsing] = useState(false);
  const [resumeError, setResumeError] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [isDragging, setIsDragging] = useState(false);
  const [dragFileName, setDragFileName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [aiProfile, setAiProfile] = useState<ResumeProfile | null>(null);
  const [aiPhase, setAiPhase] = useState<"idle" | "analyzing" | "done">("idle");
  const [userName, setUserName] = useState(user?.name || "");
  const [scoreOverride, setScoreOverride] = useState(false); // Fix #1: allow proceeding with low score
  const undoRef = useRef<{ fileName: string; resumeText: string; resumeParsed: ParsedResume | null; aiProfile: ResumeProfile | null; aiPhase: "idle" | "analyzing" | "done"; targetRole: string; targetCompany: string; userName: string } | null>(null);
  const analysisAbortRef = useRef<AbortController | null>(null);
  const [showUndo, setShowUndo] = useState(false);
  const undoTimerRef = useRef<number>(0);

  // ─── Restore resume from user profile on mount/refresh ───
  const resumeRestoredRef = useRef(false);
  useEffect(() => {
    if (resumeRestoredRef.current || resumeParsed || resumeParsing) return;
    if (!user?.resumeFileName || !user?.resumeText) return;
    resumeRestoredRef.current = true;
    setFileName(user.resumeFileName);
    setResumeText(user.resumeText);
    // Restore parsed data from DB
    const data = user.resumeData || parseResumeData(user.resumeText);
    setResumeParsed(data);
    // Restore AI profile if it was saved with the resume data
    const savedAiProfile = (data as any)?.aiProfile as ResumeProfile | undefined;
    // Prefer parsed name from resume over AI headline
    if (data.name && !userName) setUserName(data.name);
    if (savedAiProfile && savedAiProfile.headline) {
      setAiProfile(savedAiProfile);
      setAiPhase("done");
      if (!data.name && !userName && savedAiProfile.headline !== "Analyzing...") {
        setUserName(savedAiProfile.headline.split(/[—–|,]/)[0].trim().slice(0, 40));
      }
    } else {
      // No AI profile saved — re-analyze
      setAiPhase("analyzing");
      const autoRole = data.experience?.[0]?.title || "";
      analyzeResumeWithAI(user.resumeText, targetRole || autoRole)
        .then(result => {
          if (result && "profile" in result) {
            setAiProfile(result.profile);
          }
        })
        .catch(() => {})
        .finally(() => setAiPhase("done"));
    }
    if (data.experience?.[0]?.title && !targetRole) {
      setTargetRole(data.experience[0].title);
      setRoleAutoFilled(true);
    }
  }, [user?.resumeFileName, user?.resumeText]);

  // ─── Step 2: Profile (restored from localStorage if available) ───
  const [savedForm] = useState(loadObForm);
  const [targetRole, setTargetRole] = useState(savedForm?.targetRole || user?.targetRole || "");
  const [roleAutoFilled, setRoleAutoFilled] = useState(false);
  const [targetCompany, setTargetCompany] = useState(savedForm?.targetCompany || user?.targetCompany || "");
  const [interviewFocus, setInterviewFocus] = useState<string[]>(savedForm?.interviewFocus?.slice(0, 1) || ["Behavioral"]);
  const [upgradedTier, setUpgradedTier] = useState<string | null>(null); // Fix #8: local override after upgrade
  const isFreeUser = upgradedTier ? false : (!user?.subscriptionTier || user.subscriptionTier === "free");
  const [sessionLength, setSessionLength] = useState(() => {
    const saved = savedForm?.sessionLength || "10m";
    // Free users can only use 10m
    if (isFreeUser && saved !== "10m") return "10m";
    return saved;
  });

  // Auto-save form data on changes
  useEffect(() => {
    saveObForm({ targetRole, targetCompany, interviewFocus, sessionLength });
  }, [targetRole, targetCompany, interviewFocus, sessionLength]);

  // ─── Step 3: Mic ───
  const [micStatus, setMicStatus] = useState<"idle" | "requesting" | "granted" | "denied">("idle");
  const [micLevel, setMicLevel] = useState(0);
  const [starting, setStarting] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef(0);

  const goNext = () => { setSlideDir("forward"); setStep(s => { const next = Math.min(s + 1, TOTAL_STEPS); saveObStep(next); track("onboarding_step", { step: next }); return next; }); };
  const goBack = () => { setSlideDir("back"); setStep(s => { const next = Math.max(s - 1, 1); saveObStep(next); return next; }); };

  // ─── File handling ───
  const handleFileChange = async (file: File | undefined) => {
    if (!file) return;
    // Reset file input so re-selecting the same file triggers onChange
    if (fileInputRef.current) fileInputRef.current.value = "";
    // File size limit: 10MB
    if (file.size > 10 * 1024 * 1024) {
      setResumeError("File is too large. Please upload a file under 10 MB.");
      return;
    }
    // Validate file type by extension and MIME
    const ext = file.name.split(".").pop()?.toLowerCase();
    const allowedExts = ["pdf", "docx", "doc", "txt"];
    const allowedMimes = ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"];
    if (!ext || !allowedExts.includes(ext) || (file.type && !allowedMimes.includes(file.type))) {
      setResumeError("Unsupported file type. Please upload a PDF, DOCX, or TXT file.");
      return;
    }
    setFileName(file.name);
    setResumeError("");
    setResumeParsing(true);
    try {
      const text = await extractResumeText(file);
      if (!text || text.trim().length < 30) {
        const ext = file.name.split(".").pop()?.toLowerCase();
        if (ext && ["jpg", "jpeg", "png", "gif", "webp", "bmp"].includes(ext)) {
          throw new Error("Image files aren't supported. Please upload a PDF, DOCX, or TXT resume.");
        }
        throw new Error("We couldn't extract text from this file. Try a different format.");
      }
      const data = parseResumeData(text);
      setResumeText(text);
      setResumeParsed(data);
      // Build minimal fallback profile — don't use client-parsed skills (often garbage from PDFs)
      const fallback: ResumeProfile = {
        headline: data.name || "Analyzing...",
        summary: data.summary || "", yearsExperience: null, seniorityLevel: "",
        topSkills: [],
        keyAchievements: [], industries: [],
        interviewStrengths: [], interviewGaps: [],
        careerTrajectory: "",
      };
      setAiProfile(fallback);
      const autoRole = data.experience?.[0]?.title || "";
      if (autoRole && !targetRole) { setTargetRole(autoRole); setRoleAutoFilled(true); }
      const parsedName = data.name || "";
      if (parsedName && !userName) { setUserName(parsedName); }
      // AI analysis in background — abort previous if any
      analysisAbortRef.current?.abort();
      analysisAbortRef.current = new AbortController();
      const currentAbort = analysisAbortRef.current;
      setAiPhase("analyzing");
      let finalProfile: ResumeProfile = fallback;
      let aiSuccess = false;
      try {
        const result = await Promise.race([
          analyzeResumeWithAI(text, targetRole || autoRole),
          new Promise<null>((_, reject) => setTimeout(() => reject(new Error("timeout")), 30000)),
          new Promise<null>((_, reject) => {
            currentAbort.signal.addEventListener("abort", () => reject(new Error("aborted")));
          }),
        ]);
        if (result && typeof result === "object" && "profile" in result) {
          finalProfile = result.profile;
          setAiProfile(finalProfile);
          aiSuccess = true;
        }
      } catch (analysisErr: any) {
        if (analysisErr?.message === "aborted") return; // Upload was superseded
      }
      // If AI failed, use client-parsed data as fallback but only the clean fields
      if (!aiSuccess && data.skills.length > 0) {
        // Filter out skills that look like sentence fragments
        const cleanSkills = data.skills.filter(s => s.length < 30 && !s.includes(".") && s.split(/\s+/).length <= 4);
        if (cleanSkills.length > 0) {
          finalProfile = { ...fallback, topSkills: cleanSkills.slice(0, 8), headline: data.name || "Your Profile" };
          setAiProfile(finalProfile);
        }
      }
      setResumeParsing(false);
      setAiPhase("done");
      // Save resume info to profile immediately — only set name/role if not already set
      const profileSave: Partial<Parameters<typeof updateUser>[0]> = {
        resumeFileName: file.name,
        resumeText: text,
        resumeData: { ...data, aiProfile: finalProfile } as unknown as ParsedResume,
      };
      if (!targetRole && autoRole) profileSave.targetRole = autoRole;
      if (data.name) profileSave.name = data.name;
      setSaveStatus("saving");
      try {
        await updateUser(profileSave);
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 3000);
      } catch (saveErr) {
        console.error("[onboarding] Failed to save resume to profile:", saveErr);
        setSaveStatus("error");
      }
    } catch (err: any) {
      setResumeError(err.message || "Failed to parse resume");
      setResumeText(""); setResumeParsed(null);
    } finally {
      setResumeParsing(false);
    }
  };

  // ─── Mic/Camera ───
  const requestMic = useCallback(async () => {
    setMicStatus("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      setMicStatus("granted");
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);
      const poll = () => {
        analyser.getByteFrequencyData(buf);
        const avg = buf.reduce((a, b) => a + b, 0) / buf.length;
        setMicLevel(Math.min(100, Math.round((avg / 128) * 100)));
        animFrameRef.current = requestAnimationFrame(poll);
      };
      poll();
    } catch { setMicStatus("denied"); }
  }, []);

  // Browser-specific mic permission guidance
  const isChrome = typeof navigator !== "undefined" && navigator.userAgent.includes("Chrome");
  const micPermissionHint = isChrome
    ? "Click the lock icon in the address bar \u2192 Site settings \u2192 Microphone \u2192 Allow"
    : "Check your browser settings to allow microphone access";

  // Cleanup streams on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(animFrameRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  // ─── Keyboard shortcuts ───
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "BUTTON") return;
      if (e.key === "Enter") {
        e.preventDefault();
        if (step < TOTAL_STEPS) {
          if (step === 1 && (!resumeParsed || aiPhase !== "done" || !userName.trim() || (!scoreOverride && aiProfile?.resumeScore != null && aiProfile.resumeScore < 50))) return;
          if (step === 2 && (!targetRole.trim() || interviewFocus.length === 0)) return;
          goNext();
        } else {
          handleStart();
        }
      } else if (e.key === "Escape" && step > 1) {
        e.preventDefault();
        goBack();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  const handleStart = async () => {
    if (starting) return;
    setStarting(true);
    startingRef.current = true;
    // Allow proceeding even without mic — text input fallback exists in Interview
    cancelAnimationFrame(animFrameRef.current);
    // Don't stop mic stream — Interview component will re-use the permission grant
    // Only include fields that have values — don't overwrite existing data with empty strings
    const saveData: Partial<Parameters<typeof updateUser>[0]> = {
      hasCompletedOnboarding: true,
    };
    if (userName.trim()) saveData.name = userName.trim();
    if (targetRole.trim()) saveData.targetRole = targetRole.trim();
    if (targetCompany.trim()) saveData.targetCompany = targetCompany.trim();
    if (interviewFocus.length > 0) saveData.interviewTypes = interviewFocus;
    if (sessionLength) saveData.preferredSessionLength = SESSION_LENGTH_MAP[sessionLength] || 15;
    // Only send resume fields if user uploaded a resume in this session
    if (fileName) {
      saveData.resumeFileName = fileName;
      saveData.resumeText = resumeText;
      saveData.resumeData = (aiProfile || resumeParsed) as unknown as ParsedResume;
    }
    setSaveStatus("saving");
    try {
      await updateUser(saveData);
    } catch (err) {
      console.error("[handleStart] save failed:", err);
    }
    setSaveStatus("saved");
    clearObStep();
    unlockAudio();
    // Map onboarding focus labels to SessionSetup type IDs
    const FOCUS_TO_TYPE: Record<string, string> = { "Behavioral": "behavioral", "Strategic": "strategic", "Technical Leadership": "technical", "Case Study": "case-study" };
    const focusType = FOCUS_TO_TYPE[interviewFocus[0]] || "behavioral";
    track("onboarding_complete", { focus: focusType, sessionLength, role: targetRole, hasMic: micStatus === "granted" });
    navigate(`/interview?type=${encodeURIComponent(focusType)}&difficulty=standard&mini=true`);
  };

  const isStep1Busy = step === 1 && (resumeParsing || aiPhase === "analyzing");
  const isStep1NoResume = step === 1 && !resumeParsed && !resumeParsing && aiPhase !== "analyzing";
  // Fix #1: Allow proceeding with low score if user explicitly overrides
  const isStep1LowScore = step === 1 && !scoreOverride && aiPhase === "done" && aiProfile?.resumeScore != null && aiProfile.resumeScore < 50;
  const isStep1NameEmpty = step === 1 && aiPhase === "done" && !userName.trim();
  const isStep2Disabled = step === 2 && (!targetRole.trim() || interviewFocus.length === 0);
  const isContinueDisabled = isStep1Busy || isStep1NoResume || isStep1LowScore || isStep1NameEmpty || isStep2Disabled;

  return (
    <div style={{ minHeight: "100vh", background: `radial-gradient(ellipse 80% 50% at 50% 0%, rgba(212,179,127,0.03) 0%, ${c.obsidian} 70%)`, display: "flex", flexDirection: "column", position: "relative" }}>
      {user && !user.emailVerified && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 50, padding: "12px 24px", background: "rgba(212,179,127,0.1)", borderBottom: "1px solid rgba(212,179,127,0.2)", textAlign: "center", backdropFilter: "blur(8px)" }}>
          <span style={{ fontFamily: font.ui, fontSize: 13, color: c.chalk }}>
            Check your inbox for a verification link — your progress is saved automatically.
          </span>
        </div>
      )}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes progressFill { 0% { width: 0%; } 30% { width: 35%; } 60% { width: 65%; } 80% { width: 80%; } 100% { width: 92%; } }
        .ob-progress-bar { animation: progressFill 18s cubic-bezier(0.4, 0, 0.2, 1) forwards; }
        @keyframes slideInForward { from { opacity: 0; transform: translateX(40px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes slideInBack { from { opacity: 0; transform: translateX(-40px); } to { opacity: 1; transform: translateX(0); } }
        .ob-step { animation: ${slideDir === "forward" ? "slideInForward" : "slideInBack"} 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
        @keyframes popIn { from { opacity: 0; transform: scale(0.92); } to { opacity: 1; transform: scale(1); } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
        .skeleton-line { background: linear-gradient(90deg, rgba(245,242,237,0.03) 25%, rgba(245,242,237,0.07) 50%, rgba(245,242,237,0.03) 75%); background-size: 200% 100%; animation: shimmer 1.5s ease-in-out infinite; border-radius: 6px; }
        .fade-up-1 { animation: fadeUp 0.35s ease-out 0ms both; }
        .fade-up-2 { animation: fadeUp 0.35s ease-out 80ms both; }
        .fade-up-3 { animation: fadeUp 0.35s ease-out 160ms both; }
        @keyframes toastIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        .ob-card { background: rgba(17,17,19,0.7); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border: 1px solid rgba(245,242,237,0.06); }
        .ob-card-gold { background: linear-gradient(135deg, rgba(17,17,19,0.8) 0%, rgba(212,179,127,0.06) 100%); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border: 1px solid rgba(212,179,127,0.1); }
        .ob-drop:hover { border-color: rgba(212,179,127,0.35) !important; background: rgba(212,179,127,0.02) !important; }
        .ob-focus-card:hover { transform: translateY(-2px); box-shadow: 0 4px 20px rgba(0,0,0,0.3) !important; border-color: rgba(212,179,127,0.3) !important; }
        @keyframes micPulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(212,179,127,0); } 50% { box-shadow: 0 0 0 8px rgba(212,179,127,0.12); } }
        .ob-mic-pulse { animation: micPulse 2s ease-in-out infinite; }
        @media (max-width: 768px) {
          .ob-s1-split { flex-direction: column !important; }
          .ob-s1-left { max-width: 100% !important; }
          .ob-s1-profile-grid { grid-template-columns: 1fr !important; }
          .ob-s1-sg-grid { grid-template-columns: 1fr !important; }
          .ob-s1-header { flex-direction: column !important; }
          .ob-s1-header-text { max-width: 100% !important; }
          .ob-s1-header-actions { position: static !important; margin-top: 8px !important; }
          .ob-s1-name-score { grid-template-columns: 1fr !important; }
          .ob-s2-focus-grid { grid-template-columns: 1fr 1fr !important; }
          .ob-s2-bottom-row { grid-template-columns: 1fr !important; }
          .ob-s3-profile-row { flex-direction: column !important; }
        }
        @media (max-height: 700px) {
          .ob-content-area { padding-top: 16px !important; padding-bottom: 16px !important; }
        }
      `}</style>

      {/* ─── Top Bar ─── */}
      <div style={{ padding: "18px 40px", display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", borderBottom: `1px solid rgba(245,242,237,0.04)`, background: "rgba(6,6,7,0.6)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", zIndex: 10 }}>
        {/* Logo — left, clickable to go home */}
        <div onClick={() => navigate("/")} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }} title="Back to home">
          <div style={{ width: 6, height: 6, borderRadius: 2, background: `linear-gradient(135deg, ${c.gilt}, ${c.giltDark})`, boxShadow: "0 0 8px rgba(212,179,127,0.3)" }} />
          <span style={{ fontFamily: font.display, fontSize: 17, fontWeight: 400, color: c.ivory, letterSpacing: "0.02em" }}>HireStepX</span>
        </div>
        {/* Stepper — center */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {["Resume", "Profile", "Ready"].map((label, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{
                width: 26, height: 26, borderRadius: "50%",
                background: step > i + 1 ? `linear-gradient(135deg, ${c.gilt}, ${c.giltDark})` : step === i + 1 ? "rgba(212,179,127,0.1)" : "transparent",
                border: `1.5px solid ${step >= i + 1 ? c.gilt : "rgba(245,242,237,0.08)"}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
                boxShadow: step === i + 1 ? "0 0 12px rgba(212,179,127,0.15)" : "none",
              }}>
                {step > i + 1 ? (
                  <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c.obsidian} strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                ) : (
                  <span style={{ fontFamily: font.mono, fontSize: 10, fontWeight: 600, color: step === i + 1 ? c.gilt : c.stone }}>{i + 1}</span>
                )}
              </div>
              <span style={{ fontFamily: font.ui, fontSize: 11, color: step === i + 1 ? c.ivory : c.stone, fontWeight: step === i + 1 ? 500 : 400 }}>{label}</span>
              {i < 2 && <div style={{ width: 24, height: 1, background: step > i + 1 ? `linear-gradient(90deg, ${c.gilt}, rgba(212,179,127,0.2))` : "rgba(245,242,237,0.06)", transition: "background 0.4s", borderRadius: 1 }} />}
            </div>
          ))}
        </div>
        {/* Quick start shortcut */}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button onClick={() => {
            setSaveStatus("saving");
            updateUser({ hasCompletedOnboarding: true, ...(userName.trim() ? { name: userName.trim() } : {}), ...(targetRole.trim() ? { targetRole: targetRole.trim() } : {}) })
              .then(() => setSaveStatus("saved"))
              .catch(() => setSaveStatus("error"));
            clearObStep();
            unlockAudio();
            track("onboarding_skip");
            navigate("/interview?type=behavioral&difficulty=standard&mini=true");
          }}
            style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, background: "none", border: "none", cursor: "pointer", padding: "4px 0", transition: "color 0.2s" }}
            onMouseEnter={(e) => { e.currentTarget.style.color = c.ivory; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = c.stone; }}>
            Skip to quick practice →
          </button>
        </div>
      </div>

      {/* ─── Content ─── */}
      <div className="ob-content-area" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 32px", overflow: "auto" }}>
        <div key={step} className="ob-step" style={{ width: "100%", maxWidth: step === 3 ? "min(680px, calc(100vw - 32px))" : (step === 1 && !resumeParsed) ? "min(680px, calc(100vw - 32px))" : "min(960px, calc(100vw - 32px))", transition: "max-width 0.4s ease" }}>

          {/* ════════════════ STEP 1: Resume Intelligence ════════════════ */}
          {step === 1 && (
            <div>
              {/* ── State: Empty / Error ── */}
              {!resumeParsed && !resumeParsing && aiPhase !== "analyzing" && (
                <>
                  {/* Step label */}
                  <p style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 700, color: c.gilt, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 12 }}>Step 1 — Your Experience</p>

                  {/* Heading */}
                  <h2 style={{ fontFamily: font.display, fontSize: 32, fontWeight: 400, color: c.ivory, letterSpacing: "-0.025em", lineHeight: 1.2, marginBottom: 10 }}>
                    Upload your resume <span style={{ color: c.ember }}>*</span>
                  </h2>

                  {/* Description */}
                  <p style={{ fontFamily: font.ui, fontSize: 15, color: c.stone, lineHeight: 1.7, marginBottom: 28 }}>
                    Upload your resume to get personalized interview questions tailored to your experience.
                  </p>

                  {/* Drop zone — full width */}
                  <div
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); if (!dragFileName && e.dataTransfer.types.includes("Files")) setDragFileName(e.dataTransfer.items?.[0]?.getAsFile?.()?.name || ""); }}
                    onDragLeave={() => { setIsDragging(false); setDragFileName(""); }}
                    onDrop={(e) => { e.preventDefault(); setIsDragging(false); setDragFileName(""); handleFileChange(e.dataTransfer.files[0]); }}
                    onClick={() => fileInputRef.current?.click()}
                    className={!resumeError && !isDragging ? "ob-drop" : undefined}
                    style={{
                      border: `1.5px dashed ${isDragging ? c.gilt : resumeError ? c.ember : "rgba(212,179,127,0.18)"}`,
                      borderRadius: 16, padding: isDragging ? "48px 24px" : "56px 24px",
                      textAlign: "center", cursor: "pointer",
                      transition: "all 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
                      background: isDragging ? "rgba(212,179,127,0.04)" : c.graphite,
                      boxShadow: isDragging ? "0 0 30px rgba(212,179,127,0.08), inset 0 0 30px rgba(212,179,127,0.03)" : "none",
                      marginBottom: 16,
                    }}
                  >
                    <input ref={fileInputRef} type="file" accept=".pdf,.docx,.doc,.txt" onChange={(e) => handleFileChange(e.target.files?.[0])} style={{ display: "none" }} />
                    {resumeError ? (
                      <div>
                        <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c.ember} strokeWidth="1.5" style={{ marginBottom: 8 }}><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                        <p style={{ fontFamily: font.ui, fontSize: 13, color: c.ember, marginBottom: 4, lineHeight: 1.5 }}>{resumeError}</p>
                        <p style={{ fontFamily: font.ui, fontSize: 12, color: c.stone }}>Click to try a different file</p>
                      </div>
                    ) : isDragging ? (
                      <>
                        <div style={{ width: 52, height: 52, borderRadius: 14, margin: "0 auto 14px", background: "rgba(212,179,127,0.1)", border: "1px solid rgba(212,179,127,0.25)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                        </div>
                        <p style={{ fontFamily: font.ui, fontSize: 16, fontWeight: 600, color: c.gilt }}>Release to upload</p>
                        {dragFileName && <p style={{ fontFamily: font.ui, fontSize: 12, color: c.chalk, marginTop: 4 }}>{dragFileName}</p>}
                      </>
                    ) : (
                      <>
                        <div style={{ width: 52, height: 52, borderRadius: 14, margin: "0 auto 16px", background: "rgba(212,179,127,0.05)", border: "1px solid rgba(212,179,127,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                        </div>
                        <p style={{ fontFamily: font.ui, fontSize: 16, fontWeight: 500, color: c.ivory, marginBottom: 6 }}>Drop your resume here</p>
                        <p style={{ fontFamily: font.ui, fontSize: 14, color: c.stone, marginBottom: 16 }}>or click to browse</p>
                        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 10 }}>
                          {["PDF", "DOCX", "TXT"].map((t) => (
                            <span key={t} style={{ fontFamily: font.mono, fontSize: 11, fontWeight: 500, color: c.stone, background: "rgba(245,242,237,0.03)", padding: "6px 14px", borderRadius: 10, border: `1px solid rgba(245,242,237,0.06)`, letterSpacing: "0.05em" }}>{t}</span>
                          ))}
                          <span style={{ fontFamily: font.ui, fontSize: 11, color: "rgba(154,149,144,0.5)" }}>Max 10 MB</span>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Privacy bar */}
                  {!showUndo && (
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "16px 20px", borderRadius: 12, background: c.graphite, border: `1px solid ${c.border}` }}>
                      <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.stone} strokeWidth="1.5" style={{ flexShrink: 0, marginTop: 1 }}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                      <p style={{ fontFamily: font.ui, fontSize: 13, color: c.stone, lineHeight: 1.5 }}>Your resume text is used only to generate personalized interview questions. You can delete it anytime.</p>
                    </div>
                  )}

                  {/* Undo toast */}
                  {showUndo && (
                    <div className="ob-card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderRadius: 10, animation: "toastIn 0.25s ease-out", boxShadow: "0 4px 16px rgba(0,0,0,0.2)" }}>
                      <span style={{ fontFamily: font.ui, fontSize: 12, color: c.chalk }}>Resume removed</span>
                      <button onClick={() => {
                        if (!undoRef.current) return;
                        const s = undoRef.current;
                        setFileName(s.fileName); setResumeText(s.resumeText); setResumeParsed(s.resumeParsed); setAiProfile(s.aiProfile); setAiPhase(s.aiPhase); setTargetRole(s.targetRole); setTargetCompany(s.targetCompany); setUserName(s.userName);
                        setShowUndo(false); clearTimeout(undoTimerRef.current); undoRef.current = null;
                      }}
                        style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 600, color: c.gilt, background: "none", border: "none", cursor: "pointer", padding: "2px 8px" }}>
                        Undo
                      </button>
                    </div>
                  )}
                </>
              )}

              {/* ── State: Building profile (parsing + AI analyzing) ── */}
              {(resumeParsing || aiPhase === "analyzing") && aiPhase !== "done" && (
                <>
                  {/* Same headings as empty state */}
                  <p style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 700, color: c.gilt, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 12 }}>Step 1 — Your Experience</p>
                  <h2 style={{ fontFamily: font.display, fontSize: 32, fontWeight: 400, color: c.ivory, letterSpacing: "-0.025em", lineHeight: 1.2, marginBottom: 10 }}>
                    Upload your resume <span style={{ color: c.ember }}>*</span>
                  </h2>
                  <p style={{ fontFamily: font.ui, fontSize: 15, color: c.stone, lineHeight: 1.7, marginBottom: 28 }}>
                    Upload your resume to get personalized interview questions tailored to your experience.
                  </p>

                  {/* Loading card — replaces the drop zone */}
                  <div className="ob-card" style={{ borderRadius: 16, padding: "64px 32px", textAlign: "center", border: `1px solid rgba(245,242,237,0.06)` }}>
                    <div style={{ width: 60, height: 60, borderRadius: 16, margin: "0 auto 24px", background: "rgba(212,179,127,0.06)", border: "1px solid rgba(212,179,127,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <div style={{ width: 24, height: 24, border: "2.5px solid rgba(212,179,127,0.2)", borderTopColor: c.gilt, borderRadius: "50%", animation: "spin 1s linear infinite" }} />
                    </div>
                    <h3 style={{ fontFamily: font.display, fontSize: 28, fontWeight: 400, color: c.ivory, marginBottom: 14, letterSpacing: "-0.02em" }}>Building your profile</h3>
                    <p style={{ fontFamily: font.ui, fontSize: 15, color: c.stone, lineHeight: 1.7, maxWidth: 440, margin: "0 auto 8px" }}>
                      AI is analyzing your experience, skills, and achievements to create a personalized candidate profile...
                    </p>
                    {/* Progress bar */}
                    <div style={{ maxWidth: 320, margin: "20px auto 0", height: 4, borderRadius: 2, background: "rgba(245,242,237,0.06)", overflow: "hidden" }}>
                      <div className="ob-progress-bar" style={{ height: "100%", borderRadius: 2, background: `linear-gradient(90deg, ${c.gilt}, ${c.giltDark})` }} />
                    </div>
                    <p style={{ fontFamily: font.ui, fontSize: 12, color: "rgba(154,149,144,0.5)", marginTop: 8 }}>Usually 10–20 seconds</p>
                    {fileName && (
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 20, padding: "8px 16px", borderRadius: 8, background: c.graphite, border: `1px solid ${c.border}` }}>
                        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.stone} strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                        <span style={{ fontFamily: font.ui, fontSize: 14, color: c.ivory }}>{fileName}</span>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* ── State: Profile ready ── */}
              {resumeParsed && !resumeParsing && aiPhase === "done" && aiProfile && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {/* Step heading */}
                  <div style={{ marginBottom: 8 }}>
                    <p style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 700, color: c.gilt, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 12 }}>Step 1 — Your Experience</p>
                    <h2 style={{ fontFamily: font.display, fontSize: 32, fontWeight: 400, color: c.ivory, letterSpacing: "-0.025em", lineHeight: 1.2, marginBottom: 10 }}>
                      Upload your resume <span style={{ color: c.ember }}>*</span>
                    </h2>
                    <p style={{ fontFamily: font.ui, fontSize: 15, color: c.stone, lineHeight: 1.7 }}>
                      Upload your resume to get personalized interview questions tailored to your experience.
                    </p>
                  </div>

                  {/* Header: headline + badges + actions — compact row */}
                  <div className="ob-card ob-s1-header" style={{ borderRadius: 14, padding: "20px 24px", border: `1px solid rgba(245,242,237,0.06)`, display: "flex", alignItems: "flex-start", gap: 20 }}>
                    <div className="ob-s1-header-text" style={{ flex: 1, minWidth: 0 }}>
                      <h3 style={{ fontFamily: font.display, fontSize: 22, color: c.ivory, letterSpacing: "-0.025em", lineHeight: 1.2, marginBottom: 8 }}>
                        {aiProfile.headline && aiProfile.headline !== "Analyzing..." ? aiProfile.headline : userName || resumeParsed.name || "Your Profile"}
                      </h3>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                        {aiProfile.seniorityLevel && <span style={{ fontFamily: font.ui, fontSize: 10, fontWeight: 600, color: c.gilt, background: "rgba(212,179,127,0.08)", border: "1px solid rgba(212,179,127,0.18)", borderRadius: 4, padding: "2px 10px" }}>{aiProfile.seniorityLevel}</span>}
                        {aiProfile.yearsExperience && <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone }}>{aiProfile.yearsExperience}+ yrs</span>}
                        {aiProfile.industries && aiProfile.industries.length > 0 && <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone }}>{aiProfile.industries.slice(0, 2).join(", ")}</span>}
                      </div>
                      <p style={{ fontFamily: font.ui, fontSize: 13, color: c.chalk, lineHeight: 1.6, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{aiProfile.summary}</p>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10 }}>
                        <svg aria-hidden="true" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={c.stone} strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                        <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone }}>{fileName}</span>
                        <span style={{ color: c.stone, fontSize: 11 }}>·</span>
                        <button onClick={() => fileInputRef.current?.click()} style={{ fontFamily: font.ui, fontSize: 11, color: c.gilt, background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline" }}>Replace</button>
                        <input ref={fileInputRef} type="file" accept=".pdf,.docx,.doc,.txt" onChange={(e) => handleFileChange(e.target.files?.[0])} style={{ display: "none" }} />
                      </div>
                    </div>
                    <div className="ob-s1-header-actions" style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <button onClick={() => { setAiPhase("analyzing"); Promise.race([analyzeResumeWithAI(resumeText, targetRole), new Promise<null>((_, rej) => setTimeout(() => rej(new Error("timeout")), 30000))]).then(r => { if (r && typeof r === "object" && "profile" in r) setAiProfile(r.profile); setAiPhase("done"); }).catch(() => setAiPhase("done")); }}
                        style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 7, background: c.graphite, border: `1px solid ${c.border}`, cursor: "pointer", fontFamily: font.ui, fontSize: 11, color: c.stone, transition: "all 0.2s" }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(245,242,237,0.15)"; e.currentTarget.style.color = c.ivory; }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = c.border; e.currentTarget.style.color = c.stone; }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                        Re-analyze
                      </button>
                      <button onClick={() => {
                        undoRef.current = { fileName, resumeText, resumeParsed, aiProfile, aiPhase, targetRole, targetCompany, userName };
                        setFileName(""); setResumeText(""); setResumeParsed(null); setResumeError(""); setAiProfile(null); setAiPhase("idle"); setTargetRole(""); setTargetCompany(""); setUserName(""); setScoreOverride(false);
                        setShowUndo(true); clearTimeout(undoTimerRef.current);
                        undoTimerRef.current = window.setTimeout(() => { setShowUndo(false); undoRef.current = null; }, 8000);
                      }}
                        style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 7, background: c.graphite, border: `1px solid ${c.border}`, cursor: "pointer", fontFamily: font.ui, fontSize: 11, color: c.stone, transition: "all 0.2s" }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(245,242,237,0.15)"; e.currentTarget.style.color = c.ivory; }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = c.border; e.currentTarget.style.color = c.stone; }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        Remove
                      </button>
                    </div>
                  </div>

                  {/* Name field + Resume Score */}
                  <div className="ob-s1-name-score" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    {/* Editable Name */}
                    <div className="ob-card fade-up-1" style={{ borderRadius: 14, padding: "16px 20px" }}>
                      <label htmlFor="ob-name" style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 600, color: c.ivory, display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                        <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                        Your Name <span style={{ color: c.ember }}>*</span>
                      </label>
                      <input
                        id="ob-name" type="text" value={userName}
                        onChange={(e) => setUserName(e.target.value)}
                        placeholder="Enter your name (used by AI interviewer)"
                        style={{
                          width: "100%", padding: "10px 14px", borderRadius: 8,
                          background: c.graphite, border: `1.5px solid ${!userName.trim() ? c.ember : c.border}`,
                          color: c.ivory, fontFamily: font.ui, fontSize: 14,
                          outline: "none", transition: "border-color 0.2s", boxSizing: "border-box",
                        }}
                        onFocus={(e) => { e.currentTarget.style.borderColor = c.gilt; }}
                        onBlur={(e) => { e.currentTarget.style.borderColor = !userName.trim() ? c.ember : c.border; }}
                      />
                      {!userName.trim() && <p style={{ fontFamily: font.ui, fontSize: 11, color: c.ember, marginTop: 4 }}>Name is required for the interview</p>}
                      <p style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, marginTop: 4 }}>The AI interviewer will address you by this name</p>
                    </div>

                    {/* Resume Score */}
                    <div className="ob-card fade-up-1" style={{ borderRadius: 14, padding: "16px 20px", border: `1px solid ${aiProfile.resumeScore != null && aiProfile.resumeScore < 50 ? "rgba(220,80,80,0.2)" : aiProfile.resumeScore != null && aiProfile.resumeScore >= 50 ? "rgba(122,158,126,0.2)" : "rgba(245,242,237,0.06)"}` }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
                        <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                        <h4 style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 600, color: c.ivory, margin: 0 }}>Resume Score</h4>
                      </div>
                      {aiProfile.resumeScore != null ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                          {/* Circular score gauge */}
                          <div style={{ position: "relative", width: 64, height: 64, flexShrink: 0 }}>
                            <svg width="64" height="64" viewBox="0 0 64 64">
                              <circle cx="32" cy="32" r="28" fill="none" stroke="rgba(245,242,237,0.06)" strokeWidth="5" />
                              <circle cx="32" cy="32" r="28" fill="none"
                                stroke={aiProfile.resumeScore >= 50 ? c.sage : c.ember}
                                strokeWidth="5" strokeLinecap="round"
                                strokeDasharray={`${(aiProfile.resumeScore / 100) * 175.9} 175.9`}
                                transform="rotate(-90 32 32)"
                                style={{ transition: "stroke-dasharray 0.6s ease" }}
                              />
                            </svg>
                            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <span style={{ fontFamily: font.mono, fontSize: 18, fontWeight: 700, color: aiProfile.resumeScore >= 50 ? c.sage : c.ember }}>{aiProfile.resumeScore}</span>
                            </div>
                          </div>
                          <div style={{ flex: 1 }}>
                            <p style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: aiProfile.resumeScore >= 50 ? c.sage : c.ember, marginBottom: 4 }}>
                              {aiProfile.resumeScore >= 80 ? "Excellent" : aiProfile.resumeScore >= 65 ? "Good" : aiProfile.resumeScore >= 50 ? "Acceptable" : "Needs Improvement"}
                            </p>
                            <p style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, lineHeight: 1.4 }}>
                              {aiProfile.resumeScore >= 50
                                ? "Your resume meets the minimum standard. You can proceed to interview practice."
                                : "Your resume score is below 50. Please improve your resume before proceeding to interview practice."}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <p style={{ fontFamily: font.ui, fontSize: 12, color: c.stone }}>Score not available — try re-analyzing</p>
                      )}
                    </div>
                  </div>

                  {/* Resume Improvement Suggestions (shown when score < 50 OR as tips when >= 50) */}
                  {aiProfile.improvements && aiProfile.improvements.length > 0 && aiProfile.resumeScore != null && aiProfile.resumeScore < 50 && (
                    <div className="ob-card fade-up-2" style={{ borderRadius: 14, padding: "20px 24px", border: "1px solid rgba(220,80,80,0.15)", background: "rgba(220,80,80,0.03)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                        <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c.ember} strokeWidth="1.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                        <h4 style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.ember, margin: 0 }}>How to improve your resume</h4>
                        <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, marginLeft: "auto" }}>Score must be 50+ to continue</span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {aiProfile.improvements.map((tip, i) => (
                          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 14px", borderRadius: 10, background: "rgba(245,242,237,0.02)", border: "1px solid rgba(245,242,237,0.04)" }}>
                            <div style={{ width: 20, height: 20, borderRadius: 6, background: "rgba(212,179,127,0.08)", border: "1px solid rgba(212,179,127,0.18)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                              <span style={{ fontFamily: font.mono, fontSize: 10, fontWeight: 600, color: c.gilt }}>{i + 1}</span>
                            </div>
                            <span style={{ fontFamily: font.ui, fontSize: 12, color: c.chalk, lineHeight: 1.5 }}>{tip}</span>
                          </div>
                        ))}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, marginTop: 14 }}>
                        <p style={{ fontFamily: font.ui, fontSize: 12, color: c.stone }}>
                          Update your resume and upload again to re-check your score
                        </p>
                        <button onClick={() => { setScoreOverride(true); track("onboarding_score_override", { score: aiProfile.resumeScore }); }}
                          style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, background: "none", border: `1px solid ${c.border}`, borderRadius: 6, padding: "4px 12px", cursor: "pointer", whiteSpace: "nowrap", transition: "all 0.2s" }}
                          onMouseEnter={(e) => { e.currentTarget.style.color = c.ivory; e.currentTarget.style.borderColor = c.chalk; }}
                          onMouseLeave={(e) => { e.currentTarget.style.color = c.stone; e.currentTarget.style.borderColor = c.border; }}>
                          Proceed anyway
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 3-column grid: Skills | Achievements | Strengths & Gaps */}
                  <div className="ob-s1-profile-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                    {/* Skills */}
                    {aiProfile.topSkills && aiProfile.topSkills.length > 0 && (
                      <div className="ob-card fade-up-1" style={{ borderRadius: 14, padding: "16px 20px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                          <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                          <h4 style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 600, color: c.ivory, margin: 0 }}>Top Skills</h4>
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {aiProfile.topSkills.slice(0, 6).map((skill, i) => (
                            <span key={i} style={{ fontFamily: font.ui, fontSize: 11, color: i < 3 ? c.ivory : c.chalk, background: i < 3 ? "linear-gradient(135deg, rgba(212,179,127,0.12), rgba(212,179,127,0.05))" : "rgba(245,242,237,0.03)", border: `1px solid ${i < 3 ? "rgba(212,179,127,0.2)" : "rgba(245,242,237,0.06)"}`, borderRadius: 10, padding: "5px 10px", fontWeight: i < 3 ? 500 : 400 }}>{skill}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Key Achievements */}
                    {aiProfile.keyAchievements && aiProfile.keyAchievements.length > 0 && (
                      <div className="ob-card fade-up-2" style={{ borderRadius: 14, padding: "16px 20px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                          <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5"><path d="M12 15l-2 5-1-3-3-1 5-2"/><circle cx="12" cy="8" r="6"/></svg>
                          <h4 style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 600, color: c.ivory, margin: 0 }}>Key Achievements</h4>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {aiProfile.keyAchievements.slice(0, 2).map((a, i) => (
                            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 10px", borderRadius: 8, background: "rgba(245,242,237,0.02)", border: `1px solid rgba(245,242,237,0.04)` }}>
                              <div style={{ width: 18, height: 18, borderRadius: 5, background: "rgba(122,158,126,0.08)", border: `1px solid rgba(122,158,126,0.15)`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={c.sage} strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                              </div>
                              <span style={{ fontFamily: font.ui, fontSize: 12, color: c.chalk, lineHeight: 1.4 }}>{a}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Strengths & Gaps stacked */}
                    <div className="fade-up-3" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      {aiProfile.interviewStrengths && aiProfile.interviewStrengths.length > 0 && (
                        <div className="ob-card" style={{ borderRadius: 14, padding: "16px 20px", flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                            <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c.sage} strokeWidth="1.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                            <h4 style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, color: c.ivory, margin: 0 }}>Strengths</h4>
                          </div>
                          {aiProfile.interviewStrengths.slice(0, 2).map((s, i) => (
                            <div key={i} style={{ display: "flex", gap: 6, alignItems: "flex-start", marginBottom: 6 }}>
                              <span style={{ width: 4, height: 4, borderRadius: "50%", background: c.sage, flexShrink: 0, marginTop: 5 }} />
                              <span style={{ fontFamily: font.ui, fontSize: 11, color: c.chalk, lineHeight: 1.4 }}>{s}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {aiProfile.interviewGaps && aiProfile.interviewGaps.length > 0 && (
                        <div className="ob-card" style={{ borderRadius: 14, padding: "16px 20px", flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                            <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                            <h4 style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, color: c.ivory, margin: 0 }}>To Prepare</h4>
                          </div>
                          {aiProfile.interviewGaps.slice(0, 2).map((g, i) => (
                            <div key={i} style={{ display: "flex", gap: 6, alignItems: "flex-start", marginBottom: 6 }}>
                              <span style={{ width: 4, height: 4, borderRadius: "50%", background: c.gilt, flexShrink: 0, marginTop: 5 }} />
                              <span style={{ fontFamily: font.ui, fontSize: 11, color: c.chalk, lineHeight: 1.4 }}>{g}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Career trajectory + privacy — compact row */}
                  {aiProfile.careerTrajectory && (
                    <div className="ob-card fade-up-3" style={{ borderRadius: 12, padding: "12px 18px", display: "flex", alignItems: "center", gap: 10, border: `1px solid rgba(245,242,237,0.04)` }}>
                      <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={c.sage} strokeWidth="1.5" style={{ flexShrink: 0 }}><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
                      <span style={{ fontFamily: font.ui, fontSize: 12, color: c.chalk, lineHeight: 1.4 }}>{aiProfile.careerTrajectory}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ════════════════ STEP 2: Your First Session ════════════════ */}
          {step === 2 && (
            <div>
              {/* Heading */}
              <div style={{ marginBottom: 32 }} className="fade-up-1">
                <p style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 700, color: c.gilt, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 12 }}>Step 2 — Your First Session</p>
                <h2 style={{ fontFamily: font.display, fontSize: 32, fontWeight: 400, color: c.ivory, letterSpacing: "-0.025em", lineHeight: 1.2, marginBottom: 10 }}>
                  Set up your practice session
                </h2>
                <p style={{ fontFamily: font.ui, fontSize: 15, color: c.stone, lineHeight: 1.7 }}>
We've pre-filled your target role from your resume. Adjust if needed, then choose your interview focus.
                </p>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                {/* ── Section 1: Role & Company ── */}
                <div className="ob-card fade-up-1" style={{ borderRadius: 16, padding: "24px 28px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 7, background: "rgba(212,179,127,0.06)", border: "1px solid rgba(212,179,127,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
                    </div>
                    <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.ivory }}>Target Role</span>
                    <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, fontWeight: 400, marginLeft: 4 }}>— AI tailors questions to this role</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                    <div>
                      <AutocompleteInput id="ob-role" value={targetRole} onChange={(v) => { setTargetRole(v); setRoleAutoFilled(false); }} suggestions={ROLE_SUGGESTIONS} placeholder="e.g. Senior Engineering Manager..." label="Role" required error={!targetRole.trim() && interviewFocus.length > 0 ? "Required to personalize your questions" : undefined} />
                      {roleAutoFilled && targetRole && (
                        <p style={{ fontFamily: font.ui, fontSize: 11, color: c.sage, marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>
                          <svg aria-hidden="true" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={c.sage} strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
                          Auto-filled from resume
                        </p>
                      )}
                    </div>
                    <div>
                      <AutocompleteInput id="ob-company" value={targetCompany} onChange={setTargetCompany} suggestions={COMPANY_SUGGESTIONS} placeholder="e.g. Google, Stripe..." label="Company (optional)" />
                    </div>
                  </div>
                </div>

                {/* ── Section 2: Interview Focus ── */}
                <div className="ob-card fade-up-2" style={{ borderRadius: 16, padding: "24px 28px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 7, background: "rgba(212,179,127,0.06)", border: "1px solid rgba(212,179,127,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                    </div>
                    <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.ivory }}>Interview Focus <span style={{ color: c.ember, fontWeight: 400 }}>*</span></span>
                  </div>
                  <p style={{ fontFamily: font.ui, fontSize: 12, color: c.stone, marginBottom: 16, paddingLeft: 36 }}>Choose what you want to practice. AI will prepare questions based on your selection.</p>
                  <div className="ob-s2-focus-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    {[
                      { value: "Behavioral", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>, desc: "Leadership, decision-making, conflict resolution" },
                      { value: "Strategic", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>, desc: "Vision, roadmap, business alignment" },
                      { value: "Technical Leadership", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>, desc: "Architecture, system design, tech strategy" },
                      { value: "Case Study", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>, desc: "Problem-solving, analytical frameworks" },
                    ].map(opt => {
                      const sel = interviewFocus[0] === opt.value;
                      return (
                        <button key={opt.value} className="ob-focus-card" onClick={() => setInterviewFocus([opt.value])}
                          style={{
                            padding: "14px 18px", borderRadius: 12, cursor: "pointer", transition: "all 0.2s ease", textAlign: "left",
                            background: sel ? "rgba(212,179,127,0.08)" : "transparent",
                            border: `1.5px solid ${sel ? c.gilt : c.border}`,
                            boxShadow: sel ? "0 0 16px rgba(212,179,127,0.06)" : "none",
                            display: "flex", alignItems: "center", gap: 12, color: sel ? c.gilt : c.stone,
                          }}>
                          <div style={{ width: 36, height: 36, borderRadius: 9, background: sel ? "rgba(212,179,127,0.1)" : "rgba(245,242,237,0.03)", border: `1px solid ${sel ? "rgba(212,179,127,0.2)" : "rgba(245,242,237,0.06)"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            {opt.icon}
                          </div>
                          <div style={{ flex: 1 }}>
                            <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.ivory, display: "block" }}>{opt.value}</span>
                            <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, lineHeight: 1.4 }}>{opt.desc}</span>
                          </div>
                          {/* Radio indicator */}
                          <div style={{ width: 18, height: 18, borderRadius: "50%", border: `2px solid ${sel ? c.gilt : "rgba(245,242,237,0.12)"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            {sel && <div style={{ width: 8, height: 8, borderRadius: "50%", background: c.gilt }} />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* ── Section 3: Session Length ── */}
                <div className="ob-card fade-up-3" style={{ borderRadius: 16, padding: "24px 28px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 7, background: "rgba(212,179,127,0.06)", border: "1px solid rgba(212,179,127,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    </div>
                    <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.ivory }}>Session Length</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                    {[
                      { value: "10m", label: "10 min", desc: "Quick practice", sub: "2–3 questions", paidOnly: false },
                      { value: "15m", label: "15 min", desc: "Standard session", sub: "4–5 questions", recommended: true, paidOnly: true },
                      { value: "25m", label: "25 min", desc: "Deep dive", sub: "6–8 questions", paidOnly: true },
                    ].map(opt => {
                      const isFreeUser = !user?.subscriptionTier || user.subscriptionTier === "free";
                      const locked = opt.paidOnly && isFreeUser;
                      const sel = sessionLength === opt.value;
                      return (
                        <button key={opt.value} onClick={() => { if (locked) { setShowUpgradeModal(true); } else { setSessionLength(opt.value); } }}
                          style={{
                            padding: "16px 14px", borderRadius: 12, cursor: "pointer", textAlign: "center", position: "relative",
                            background: sel ? "rgba(212,179,127,0.08)" : "transparent",
                            border: `1.5px solid ${sel ? c.gilt : c.border}`,
                            boxShadow: sel ? "0 0 16px rgba(212,179,127,0.06)" : "none",
                            transition: "all 0.2s",
                            opacity: locked ? 0.5 : 1,
                          }}>
                          {opt.recommended && !locked && (
                            <span style={{ position: "absolute", top: -8, left: "50%", transform: "translateX(-50%)", fontFamily: font.ui, fontSize: 9, fontWeight: 700, color: c.obsidian, background: c.gilt, padding: "2px 8px", borderRadius: 4, letterSpacing: "0.04em", textTransform: "uppercase" }}>Recommended</span>
                          )}
                          {locked && (
                            <span style={{ position: "absolute", top: -8, left: "50%", transform: "translateX(-50%)", fontFamily: font.ui, fontSize: 9, fontWeight: 700, color: c.gilt, background: "rgba(212,179,127,0.1)", border: "1px solid rgba(212,179,127,0.2)", padding: "2px 8px", borderRadius: 4, letterSpacing: "0.04em", textTransform: "uppercase", display: "flex", alignItems: "center", gap: 3 }}>
                              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                              Upgrade
                            </span>
                          )}
                          <span style={{ fontFamily: font.ui, fontSize: 20, fontWeight: 600, color: sel ? c.gilt : c.ivory, display: "block", marginBottom: 2 }}>{opt.label}</span>
                          <span style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 500, color: sel ? c.ivory : c.chalk, display: "block", marginBottom: 2 }}>{opt.desc}</span>
                          <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone }}>{opt.sub}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ════════════════ STEP 3: Permissions & Review ════════════════ */}
          {step === 3 && (
            <div>
              {/* Heading — consistent with Steps 1 & 2 */}
              <div style={{ marginBottom: 32 }} className="fade-up-1">
                <p style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 700, color: c.gilt, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 12 }}>Step 3 — Almost There</p>
                <h2 style={{ fontFamily: font.display, fontSize: 32, fontWeight: 400, color: c.ivory, letterSpacing: "-0.025em", lineHeight: 1.2, marginBottom: 10 }}>
                  Allow permissions & review
                </h2>
                <p style={{ fontFamily: font.ui, fontSize: 15, color: c.stone, lineHeight: 1.7 }}>
                  We need microphone access for the interview. Review your profile below, then you're ready to go.
                </p>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                {/* ── Permissions Card — side by side ── */}
                <div className="ob-card fade-up-1" style={{ borderRadius: 16, padding: "24px 28px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 7, background: "rgba(212,179,127,0.06)", border: "1px solid rgba(212,179,127,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5" strokeLinecap="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>
                    </div>
                    <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.ivory }}>Permissions</span>
                  </div>

                  <div className={micStatus !== "granted" ? "ob-mic-pulse" : undefined}
                    style={{ display: "flex", alignItems: "center", gap: 16, padding: "20px 24px", borderRadius: 12, background: micStatus === "granted" ? "rgba(122,158,126,0.04)" : "rgba(245,242,237,0.02)", border: `1px solid ${micStatus === "granted" ? "rgba(122,158,126,0.12)" : "rgba(212,179,127,0.2)"}` }}>
                    <div style={{ width: 44, height: 44, borderRadius: 12, background: micStatus === "granted" ? `${c.sage}12` : "rgba(245,242,237,0.03)", border: `1px solid ${micStatus === "granted" ? `${c.sage}25` : "rgba(245,242,237,0.06)"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={micStatus === "granted" ? c.sage : c.stone} strokeWidth="1.5" strokeLinecap="round">
                        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                      </svg>
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.ivory, marginBottom: 4 }}>Microphone</p>
                      <p style={{ fontFamily: font.ui, fontSize: 12, color: micStatus === "granted" ? c.sage : c.stone, lineHeight: 1.4 }}>
                        {micStatus === "granted" ? "Connected — ready to go" : micStatus === "denied" ? "No worries — you can type your answers instead" : "Recommended for the best interview experience"}
                      </p>
                      {micStatus === "granted" && (
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
                          <div style={{ width: 80, height: 4, borderRadius: 2, background: "rgba(245,242,237,0.06)", overflow: "hidden" }}>
                            <div style={{ height: "100%", borderRadius: 2, background: c.sage, width: `${Math.max(5, micLevel)}%`, transition: "width 0.1s" }} />
                          </div>
                          <span style={{ fontFamily: font.ui, fontSize: 10, color: c.sage }}>Live</span>
                        </div>
                      )}
                    </div>
                    {micStatus !== "granted" && (
                      <button onClick={requestMic}
                        style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 600, color: c.gilt, background: "rgba(212,179,127,0.08)", border: `1px solid rgba(212,179,127,0.2)`, borderRadius: 8, padding: "8px 20px", cursor: "pointer", transition: "all 0.2s", flexShrink: 0 }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(212,179,127,0.15)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(212,179,127,0.08)"; }}>
                        {micStatus === "denied" ? "Retry" : "Allow Microphone"}
                      </button>
                    )}
                    </div>
                </div>

                {/* ── Your Profile Card ── */}
                <div className="ob-card fade-up-2" style={{ borderRadius: 16, padding: "24px 28px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 7, background: "rgba(212,179,127,0.06)", border: "1px solid rgba(212,179,127,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    </div>
                    <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.ivory }}>Your Profile</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                    {[
                      { label: "Resume", value: fileName || "Not uploaded", icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c.stone} strokeWidth="1.5" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>, editStep: 1 },
                      { label: "Target Role", value: targetRole || "Not set", icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c.stone} strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>, editStep: 2 },
                      { label: "Target Company", value: targetCompany || "Exploring", icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c.stone} strokeWidth="1.5" strokeLinecap="round"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="9" y1="6" x2="15" y2="6"/><line x1="9" y1="10" x2="15" y2="10"/><line x1="9" y1="14" x2="15" y2="14"/></svg>, editStep: 2 },
                      { label: "Interview Focus", value: interviewFocus.length > 0 ? interviewFocus.join(", ") : "None selected", icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c.stone} strokeWidth="1.5" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>, editStep: 2 },
                      { label: "Session Length", value: sessionLength === "10m" ? "10 minutes" : sessionLength === "25m" ? "25 minutes" : "15 minutes", icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c.stone} strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>, editStep: 2 },
                    ].map((item, i, arr) => (
                      <div key={item.label}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 0" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
                            <span style={{ flexShrink: 0, display: "flex" }}>{item.icon}</span>
                            <span style={{ fontFamily: font.ui, fontSize: 13, color: c.stone, flexShrink: 0 }}>{item.label}</span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 500, color: item.value === "Not set" || item.value === "Not uploaded" || item.value === "None selected" ? "rgba(154,149,144,0.5)" : c.ivory, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "right" }}>
                              {item.value}
                            </span>
                            <button
                              onClick={() => { setSlideDir("back"); setStep(item.editStep); }}
                              style={{ background: "none", border: "none", cursor: "pointer", padding: 4, display: "flex", alignItems: "center", opacity: 0.3, transition: "opacity 0.2s" }}
                              onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.8"; }}
                              onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.3"; }}
                              aria-label={`Edit ${item.label}`}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c.stone} strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            </button>
                          </div>
                        </div>
                        {i < arr.length - 1 && <div style={{ height: 1, background: "rgba(245,242,237,0.04)" }} />}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ─── Navigation ─── */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, marginTop: 40 }}>
            {/* Main row: back + continue/start side by side on steps 2/3 */}
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {step > 1 && (
                <button onClick={goBack}
                  style={{
                    fontFamily: font.ui, fontSize: 14, fontWeight: 500, padding: "14px 20px", borderRadius: 10,
                    border: `1px solid ${c.border}`, background: "transparent", color: c.chalk,
                    cursor: "pointer", transition: "all 0.2s ease", display: "inline-flex", alignItems: "center", gap: 6,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = c.chalk; e.currentTarget.style.color = c.ivory; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = c.border; e.currentTarget.style.color = c.chalk; }}>
                  <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
                  Back
                </button>
              )}

              {step < TOTAL_STEPS ? (
                <button onClick={goNext} disabled={isContinueDisabled}
                  style={{
                    fontFamily: font.ui, fontSize: 15, fontWeight: 600, padding: "14px 40px", borderRadius: 10, border: "none",
                    background: isContinueDisabled ? "rgba(212,179,127,0.15)" : `linear-gradient(135deg, ${c.gilt}, ${c.giltDark})`,
                    color: isContinueDisabled ? "rgba(212,179,127,0.4)" : c.obsidian,
                    cursor: isContinueDisabled ? "not-allowed" : "pointer",
                    transition: "all 0.25s ease", display: "inline-flex", alignItems: "center", gap: 8,
                    boxShadow: isContinueDisabled ? "none" : "0 8px 24px rgba(212,179,127,0.2)",
                  }}
                  onMouseEnter={(e) => { if (!isContinueDisabled) { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 12px 32px rgba(212,179,127,0.3)"; } }}
                  onMouseLeave={(e) => { if (!isContinueDisabled) { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 8px 24px rgba(212,179,127,0.2)"; } }}>
                  Continue
                  <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
              ) : (
                <>
                <button onClick={handleStart} disabled={starting}
                  style={{
                    fontFamily: font.ui, fontSize: 15, fontWeight: 600, padding: "14px 40px", borderRadius: 10, border: "none",
                    background: starting ? "rgba(212,179,127,0.15)" : `linear-gradient(135deg, ${c.gilt}, ${c.giltDark})`,
                    color: starting ? "rgba(212,179,127,0.4)" : c.obsidian,
                    cursor: starting ? "not-allowed" : "pointer",
                    transition: "all 0.25s ease", display: "inline-flex", alignItems: "center", gap: 8,
                    boxShadow: starting ? "none" : "0 8px 24px rgba(212,179,127,0.2)",
                  }}
                  onMouseEnter={(e) => { if (!starting) { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 12px 32px rgba(212,179,127,0.3)"; } }}
                  onMouseLeave={(e) => { if (!starting) { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 8px 24px rgba(212,179,127,0.2)"; } }}>
                  {starting ? (
                    <div style={{ width: 16, height: 16, border: "2.5px solid rgba(212,179,127,0.3)", borderTopColor: c.gilt, borderRadius: "50%", animation: "spin 1s linear infinite" }} />
                  ) : (
                    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polygon points="5,3 19,12 5,21"/></svg>
                  )}
                  {starting ? "Starting..." : micStatus === "granted" ? "Start Practice Interview" : "Start with Text Input"}
                </button>
                {micStatus !== "granted" && (
                  <p style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, textAlign: "center", marginTop: 8 }}>
                    You can type your answers instead of speaking
                  </p>
                )}
                </>
              )}
            </div>

            {/* Save status indicator */}
            {saveStatus !== "idle" && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, animation: "fadeUp 0.25s ease-out" }}>
                {saveStatus === "saving" && <div style={{ width: 10, height: 10, border: "1.5px solid rgba(212,179,127,0.3)", borderTopColor: c.gilt, borderRadius: "50%", animation: "spin 1s linear infinite" }} />}
                {saveStatus === "saved" && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={c.sage} strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>}
                {saveStatus === "error" && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={c.ember} strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/></svg>}
                <span style={{ fontFamily: font.ui, fontSize: 11, color: saveStatus === "error" ? c.ember : saveStatus === "saved" ? c.sage : c.stone }}>
                  {saveStatus === "saving" ? "Saving..." : saveStatus === "saved" ? "Progress saved" : "Save failed — your data is safe locally"}
                </span>
              </div>
            )}

          </div>
        </div>
      </div>
      {showUpgradeModal && (
        <UpgradeModal
          onClose={() => setShowUpgradeModal(false)}
          sessionsUsed={0}
          user={user}
          currentTier={user?.subscriptionTier || "free"}
          onPaymentSuccess={(tier, start, end) => {
            setShowUpgradeModal(false);
            setUpgradedTier(tier); // Fix #8: immediately unlock session lengths
            updateUser({ subscriptionTier: tier as "starter" | "pro", subscriptionStart: start, subscriptionEnd: end });
            track("onboarding_upgrade", { tier });
          }}
        />
      )}
    </div>
  );
}
