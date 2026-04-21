/* ─── Resume Text Extraction ─── */
/* Extracts plain text from PDF, DOCX, and TXT files client-side */

/** Read a .txt file directly */
function readTxt(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string) || "");
    reader.onerror = () => reject(new Error("Failed to read text file"));
    reader.readAsText(file);
  });
}

/** Extract text from a .docx file by parsing its XML content */
async function readDocx(file: File): Promise<string> {
  // DOCX is a ZIP containing word/document.xml
  const arrayBuffer = await file.arrayBuffer();
  const { entries } = await unzip(new Uint8Array(arrayBuffer));
  const docEntry = entries.find(e => e.filename === "word/document.xml");
  if (!docEntry) throw new Error("Invalid DOCX: no document.xml found");

  const xmlText = new TextDecoder().decode(docEntry.data);
  // Extract text from <w:t> tags
  const textParts: string[] = [];
  const regex = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xmlText)) !== null) {
    textParts.push(match[1]);
  }

  // Also handle paragraph breaks <w:p> → newlines
  let result = xmlText;
  result = result.replace(/<\/w:p>/g, "\n");
  result = result.replace(/<w:br[^/]*\/>/g, "\n");

  // Re-extract with paragraph awareness
  const lines: string[] = [];
  // Simpler approach: split by paragraph, extract text from each
  const paragraphs = xmlText.split(/<\/w:p>/);
  for (const para of paragraphs) {
    const paraTexts: string[] = [];
    const tRegex = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g;
    let tMatch: RegExpExecArray | null;
    while ((tMatch = tRegex.exec(para)) !== null) {
      paraTexts.push(tMatch[1]);
    }
    if (paraTexts.length > 0) {
      lines.push(paraTexts.join(""));
    }
  }

  return lines.join("\n").trim();
}

/** Minimal ZIP reader for DOCX extraction (no dependencies) */
async function unzip(data: Uint8Array): Promise<{ entries: { filename: string; data: Uint8Array }[] }> {
  const entries: { filename: string; data: Uint8Array }[] = [];
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  let offset = 0;
  while (offset < data.length - 4) {
    const sig = view.getUint32(offset, true);
    if (sig !== 0x04034b50) break; // PK\x03\x04

    const compressionMethod = view.getUint16(offset + 8, true);
    const compressedSize = view.getUint32(offset + 18, true);
    // uncompressedSize at offset+22 skipped (unused in extraction)
    const fileNameLen = view.getUint16(offset + 26, true);
    const extraLen = view.getUint16(offset + 28, true);
    const filename = new TextDecoder().decode(data.subarray(offset + 30, offset + 30 + fileNameLen));
    const fileDataOffset = offset + 30 + fileNameLen + extraLen;
    const compressedData = data.subarray(fileDataOffset, fileDataOffset + compressedSize);

    if (compressionMethod === 0) {
      // Stored (no compression)
      entries.push({ filename, data: compressedData });
    } else if (compressionMethod === 8) {
      // Deflate — use DecompressionStream API
      try {
        const ds = new DecompressionStream("deflate-raw");
        const writer = ds.writable.getWriter();
        const reader = ds.readable.getReader();

        const chunks: Uint8Array[] = [];
        const readAll = (async () => {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
          }
        })();

        writer.write(new Uint8Array(compressedData) as unknown as BufferSource);
        writer.close();
        await readAll;

        const totalLen = chunks.reduce((s, c) => s + c.length, 0);
        const result = new Uint8Array(totalLen);
        let pos = 0;
        for (const chunk of chunks) {
          result.set(chunk, pos);
          pos += chunk.length;
        }
        entries.push({ filename, data: result });
      } catch {
        // Skip entries we can't decompress
      }
    }

    offset = fileDataOffset + compressedSize;
  }

  return { entries };
}

/** Extract text from a PDF using locally bundled pdf.js */
async function readPdf(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();

  const pdfjsLib = await import("pdfjs-dist");
  // Next.js: use CDN worker to avoid bundling issues
  const pdfjsVersion = (pdfjsLib as unknown as { version?: string }).version || "4.0.379";
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsVersion}/pdf.worker.min.mjs`;

  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;

  const textParts: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const items = content.items as { str?: string; transform?: number[] }[];

    // Reconstruct text with line breaks by detecting Y-position changes
    // PDF text items have transform[5] = Y position (higher = higher on page)
    const lines: string[] = [];
    let currentLine = "";
    let lastY: number | null = null;

    for (const item of items) {
      if (!("str" in item) || !item.str) continue;
      const y = item.transform ? item.transform[5] : null;

      if (lastY !== null && y !== null && Math.abs(y - lastY) > 2) {
        // Y position changed significantly = new line
        if (currentLine.trim()) lines.push(currentLine.trim());
        currentLine = item.str;
      } else {
        // Same line — add space between items if needed
        const needsSpace = currentLine.length > 0 && !currentLine.endsWith(" ") && !item.str.startsWith(" ");
        currentLine += (needsSpace ? " " : "") + item.str;
      }
      lastY = y;
    }
    if (currentLine.trim()) lines.push(currentLine.trim());
    textParts.push(lines.join("\n"));
  }

  // Collapse spaced-out letters (common in decorative PDF headers)
  // e.g. "C O N T A C T" → "CONTACT", "E D U C A T I O N" → "EDUCATION"
  const raw = textParts.join("\n\n").trim();
  return raw.replace(/\b([A-Z]) (?:[A-Z] ){2,}[A-Z]\b/g, (match) =>
    match.replace(/ /g, "")
  );
}

/* ─── Structured Resume Data ─── */

export interface ResumeExperience {
  title: string;
  company: string;
  period: string;
  bullets: string[];
}

export interface ResumeEducation {
  degree: string;
  school: string;
  year: string;
}

export interface ParsedResume {
  name: string;
  email: string;
  phone: string;
  location: string;
  linkedin: string;
  summary: string;
  skills: string[];
  experience: ResumeExperience[];
  education: ResumeEducation[];
  certifications: string[];
}

const SECTION_PATTERNS: Record<string, RegExp> = {
  summary: /\b(summary|profile|objective|about\s*me|professional\s*summary|career\s*summary|executive\s*summary)\b/i,
  experience: /\b(experience|work\s*history|employment|professional\s*experience|work\s*experience|career\s*history)\b/i,
  education: /\b(education|academic|qualifications|degrees?)\b/i,
  skills: /\b(skills|technical\s*skills|core\s*competencies|competencies|technologies|tools|proficiencies|expertise)\b/i,
  certifications: /\b(certifications?|licenses?|credentials|accreditations?|professional\s*development)\b/i,
};

function extractContact(text: string): Pick<ParsedResume, "name" | "email" | "phone" | "location" | "linkedin"> {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);

  const emailMatch = text.match(/[\w.+-]+@[\w-]+\.[\w.]+/);
  const phoneMatch = text.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
  const linkedinMatch = text.match(/linkedin\.com\/in\/[\w-]+/i);

  // Location: look for City, ST or City, State patterns
  const locationMatch = text.match(/([A-Z][a-z]+(?:\s[A-Z][a-z]+)*,\s*[A-Z]{2})\b/) ||
    text.match(/([A-Z][a-z]+(?:\s[A-Z][a-z]+)*,\s*[A-Z][a-z]+(?:\s[A-Z][a-z]+)*)/);

  // Indian city detection fallback
  const INDIAN_CITIES = new Set([
    "bangalore", "bengaluru", "mumbai", "bombay", "delhi", "new delhi", "delhi ncr",
    "gurgaon", "gurugram", "noida", "greater noida", "ghaziabad", "faridabad",
    "hyderabad", "pune", "chennai", "madras", "kolkata", "calcutta",
    "ahmedabad", "jaipur", "chandigarh", "mohali", "kochi", "cochin",
    "thiruvananthapuram", "trivandrum", "lucknow", "indore", "coimbatore",
    "nagpur", "visakhapatnam", "vizag", "bhubaneswar", "mysore", "mysuru",
    "mangalore", "mangaluru", "vadodara", "baroda", "surat",
    "bhopal", "patna", "ranchi", "dehradun", "raipur", "guwahati",
    "agra", "varanasi", "amritsar", "jodhpur", "udaipur", "kanpur",
    "allahabad", "prayagraj", "nashik", "aurangabad", "rajkot", "hubli",
    "belgaum", "belagavi", "salem", "tiruchirappalli", "trichy", "madurai",
    "vijayawada", "guntur", "warangal", "navi mumbai", "thane",
    "pimpri-chinchwad", "gandhinagar", "shimla", "srinagar", "jammu",
    "panaji", "imphal", "shillong", "aizawl", "kohima", "agartala",
    "itanagar", "gangtok", "pondicherry", "puducherry",
    "nellore", "tirupati", "kakinada", "rajahmundry",
    "jalandhar", "ludhiana", "patiala", "bathinda",
    "meerut", "aligarh", "bareilly", "moradabad",
    "jamshedpur", "dhanbad", "bokaro",
    "cuttack", "rourkela", "sambalpur",
    "siliguri", "durgapur", "asansol",
    "kozhikode", "calicut", "thrissur", "kollam",
    "tiruvallur", "vellore", "erode", "tirunelveli",
    "belgaum", "dharwad", "gulbarga", "kalaburagi",
    "kolhapur", "solapur", "sangli", "satara",
  ]);

  let resolvedLocation = locationMatch?.[1] || "";

  // If no location found or found location doesn't contain an Indian city, scan header lines
  if (!resolvedLocation || !Array.from(INDIAN_CITIES).some(c => resolvedLocation.toLowerCase().includes(c))) {
    const headerLines = lines.slice(0, 15);
    for (const line of headerLines) {
      const lower = line.toLowerCase();
      for (const city of INDIAN_CITIES) {
        if (lower.includes(city)) {
          // Use the original case from the line
          const idx = lower.indexOf(city);
          resolvedLocation = line.substring(idx, idx + city.length);
          // Capitalize first letter
          resolvedLocation = resolvedLocation.charAt(0).toUpperCase() + resolvedLocation.slice(1);
          break;
        }
      }
      if (resolvedLocation && INDIAN_CITIES.has(resolvedLocation.toLowerCase())) break;
    }
  }

  // Name: first non-empty line that isn't an email/phone/url/section header
  const sectionHeaderPattern = /^(contact|details|personal\s*info|personal\s*details|resume|curriculum\s*vitae|cv|bio|biodata|info|about|address|references|summary|profile|objective|about\s*me|professional\s*summary|career\s*summary|executive\s*summary|experience|work\s*history|employment|professional\s*experience|work\s*experience|career\s*history|education|academic|qualifications|degrees?|skills|technical\s*skills|core\s*competencies|competencies|technologies|tools|proficiencies|expertise|certifications?|licenses?|credentials|accreditations?|professional\s*development|projects?|achievements?|awards?|publications?|interests?|hobbies?|languages?|declaration)$/i;
  let name = "";
  for (const line of lines.slice(0, 8)) {
    if (line.match(/@/) || line.match(/\d{5,}/) || line.match(/linkedin|http|www\./i) || line.match(/\(\d{3}\)/)) continue;
    if (line.match(SECTION_PATTERNS.summary) || line.match(SECTION_PATTERNS.experience)) continue;
    let cleaned = line.replace(/[-—:=|_*#.]+/g, "").trim();
    // Collapse any remaining spaced-out letters (e.g. "C O N T A C T" → "CONTACT")
    cleaned = cleaned.replace(/\b([A-Z]) (?:[A-Z] ){1,}[A-Z]\b/g, m => m.replace(/ /g, ""));
    if (sectionHeaderPattern.test(cleaned)) continue;
    // Skip single all-caps words (section headers like "CONTACT", "SKILLS")
    // But allow 2-3 word all-caps (could be a name like "JAY VYAS")
    if (/^[A-Z]{2,}$/.test(cleaned)) continue;
    if (cleaned.length > 2 && cleaned.length < 60) { name = cleaned; break; }
  }

  return {
    name,
    email: emailMatch?.[0] || "",
    phone: phoneMatch?.[0] || "",
    location: resolvedLocation,
    linkedin: linkedinMatch?.[0] || "",
  };
}

function splitSections(text: string): Record<string, string> {
  const lines = text.split("\n");
  const sections: { key: string; start: number }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    for (const [key, pattern] of Object.entries(SECTION_PATTERNS)) {
      // Match lines that are mostly just the section header (allow some decoration like dashes, colons)
      const cleaned = line.replace(/[-—:=|_*#]+/g, "").trim();
      if (cleaned.length < 40 && pattern.test(cleaned)) {
        sections.push({ key, start: i });
        break;
      }
    }
  }

  const result: Record<string, string> = {};
  for (let i = 0; i < sections.length; i++) {
    const end = i + 1 < sections.length ? sections[i + 1].start : lines.length;
    // Skip the header line itself
    const body = lines.slice(sections[i].start + 1, end).join("\n").trim();
    if (body) result[sections[i].key] = body;
  }
  return result;
}

function parseSkills(text: string): string[] {
  // Skills are typically comma, pipe, or bullet separated
  const skills = text
    .split(/[,|•·●►▸▪■◆★\n]/)
    .map(s => s.replace(/[-–—:]/g, " ").trim())
    .filter(s => s.length > 1 && s.length < 50 && !s.match(SECTION_PATTERNS.skills));

  // Deduplicate
  const seen = new Set<string>();
  return skills.filter(s => {
    const key = s.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parseExperience(text: string): ResumeExperience[] {
  const entries: ResumeExperience[] = [];
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);

  // Heuristic: a new entry starts with a line containing a date-like pattern or a title/company pair
  const datePattern = /\b(19|20)\d{2}\b|present|current/i;
  const bulletPattern = /^[•·●►▸▪■◆★\-–—]\s*/;

  let current: ResumeExperience | null = null;

  for (const line of lines) {
    const isBullet = bulletPattern.test(line);
    const hasDate = datePattern.test(line);

    if (!isBullet && (hasDate || (!current && line.length < 80))) {
      // Start a new entry
      if (current && (current.title || current.company)) entries.push(current);

      // Try to parse "Title at Company" or "Title | Company" or "Title, Company"
      const datePart = line.match(/((?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\.?\s*\d{0,4}\s*[-–—to]+\s*(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)?\w*\.?\s*\d{0,4})|(?:\d{1,2}\/\d{4}\s*[-–—to]+\s*\d{1,2}\/\d{4})|(?:\(?\d{4}\s*[-–—to]+\s*(?:\d{4}|present|current)\)?))/i);
      const period = datePart?.[0]?.replace(/[()]/g, "").trim() || "";
      const rest = line.replace(datePart?.[0] || "", "").replace(/[|,–—]\s*$/, "").trim();

      // Split into title and company
      const splitMatch = rest.match(/^(.+?)\s*(?:at|@|\||,|–|—)\s*(.+)$/i);
      current = {
        title: splitMatch ? splitMatch[1].trim() : rest,
        company: splitMatch ? splitMatch[2].trim() : "",
        period,
        bullets: [],
      };
    } else if (current && isBullet) {
      current.bullets.push(line.replace(bulletPattern, "").trim());
    } else if (current && !isBullet && line.length < 80 && !current.company) {
      // Might be company on a separate line
      current.company = line;
    } else if (current && line.length > 20) {
      // Long non-bullet line — treat as a bullet
      current.bullets.push(line);
    }
  }
  if (current && (current.title || current.company)) entries.push(current);

  return entries;
}

function parseEducation(text: string): ResumeEducation[] {
  const entries: ResumeEducation[] = [];
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  const yearPattern = /\b(19|20)\d{2}\b/;
  const degreePattern = /\b(B\.?S\.?|B\.?A\.?|M\.?S\.?|M\.?A\.?|M\.?B\.?A\.?|Ph\.?D\.?|Bachelor|Master|Doctor|Associate|Diploma|Certificate)\b/i;

  let current: ResumeEducation | null = null;
  for (const line of lines) {
    if (line.match(/^[•·●►▸▪■◆★\-–—]/)) continue; // skip bullets
    const hasDegree = degreePattern.test(line);
    const hasYear = yearPattern.test(line);

    if (hasDegree || (hasYear && line.length < 100)) {
      if (current && current.degree) entries.push(current);
      const yearMatch = line.match(yearPattern);
      const year = yearMatch?.[0] || "";
      const rest = line.replace(/\b(19|20)\d{2}\b/g, "").replace(/[-–—|,]\s*$/, "").trim();

      const splitMatch = rest.match(/^(.+?)\s*(?:at|from|,|\||–|—)\s*(.+)$/i);
      current = {
        degree: splitMatch ? splitMatch[1].trim() : rest,
        school: splitMatch ? splitMatch[2].trim() : "",
        year,
      };
    } else if (current && !current.school && line.length < 80) {
      current.school = line;
    }
  }
  if (current && current.degree) entries.push(current);
  return entries;
}

function parseCertifications(text: string): string[] {
  return text
    .split("\n")
    .map(l => l.replace(/^[•·●►▸▪■◆★\-–—]\s*/, "").trim())
    .filter(l => l.length > 2 && l.length < 120);
}

/** Parse raw resume text into structured data */
export function parseResumeData(rawText: string): ParsedResume {
  const contact = extractContact(rawText);
  const sections = splitSections(rawText);

  return {
    ...contact,
    summary: sections.summary?.replace(/\n/g, " ").trim() || "",
    skills: sections.skills ? parseSkills(sections.skills) : [],
    experience: sections.experience ? parseExperience(sections.experience) : [],
    education: sections.education ? parseEducation(sections.education) : [],
    certifications: sections.certifications ? parseCertifications(sections.certifications) : [],
  };
}

/**
 * Extract text from a resume file.
 * Supports: .pdf, .docx, .doc, .txt
 * Returns the extracted text, trimmed to max 5000 chars for LLM context.
 */
export async function extractResumeText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  let text = "";

  if (name.endsWith(".txt")) {
    text = await readTxt(file);
  } else if (name.endsWith(".docx")) {
    text = await readDocx(file);
  } else if (name.endsWith(".doc")) {
    // .doc is a binary format — try reading as text (works sometimes for simple docs)
    text = await readTxt(file);
    // If it's binary garbage, return a helpful message
    if (text.includes("\x00") || text.includes("\ufffd")) {
      throw new Error("Old .doc format is not supported. Please convert to .docx or PDF first (open in Word or Google Docs \u2192 Save As).");
    }
  } else if (name.endsWith(".pdf")) {
    text = await readPdf(file);
    // Detect scanned/image-based PDFs that yield no extractable text
    if (text.trim().length < 30) {
      throw new Error(
        text.trim().length === 0
          ? "This PDF appears to be a scanned image with no extractable text. Please upload a text-based PDF, or copy your resume into a DOCX/TXT file."
          : "Very little text was extracted from this PDF — it may be a scanned document. For best results, upload a text-based PDF or DOCX file."
      );
    }
  } else {
    throw new Error("Unsupported file type. Please upload a PDF, DOCX, or TXT file.");
  }

  // Clean up whitespace
  text = text.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();

  // Cap at 5000 chars for LLM context efficiency
  if (text.length > 5000) {
    text = text.slice(0, 5000);
  }

  return text;
}
