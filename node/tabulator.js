const fs = require('fs');
const path = require('path');

const DELAWARE_LOCATIONS = new Set(['DE', 'NDE', 'KDE', 'SDE']);
const VALID_MODES = new Map([
  ['PH', 1],   // Phone = 1 point
  ['CW', 2],   // Morse = 2 points
  ['RY', 2],   // Digital = 2 points
]);
const VALID_SECTIONS = new Set([
  // US States (by state or ARRL sections)
  'AL', 'AK', 'AZ', 'AR', 'CO', 'CT', 'DE', 'GA', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'ND', 'OH', 'OK', 'RI', 'SC', 'SD', 'TN', 'UT', 'VT', 'WV', 'WI', 'WY',
  // California Sections
  'CA', 'EB', 'LAX', 'ORG', 'SV', 'SDG', 'SF', 'SJV', 'SB', 'SCV',
  // Florida Sections
  'FL', 'NFL', 'SFL', 'WCF',
  // Hawaii/Pacific
  'HI', 'PAC',
  // Maryland/DC
  'MD', 'DC', 'MDC',
  // Massachusetts Sections
  'MA', 'EMA', 'WMA',
  // New Jersey Sections
  'NJ', 'NNJ', 'SNJ',
  // New Mexico
  'NM',
  // New York Sections
  'NY', 'ENY', 'NNY', 'WNY', 'NLI',
  // North Carolina
  'NC',
  // Oregon
  'OR',
  // Pennsylvania Sections
  'PA', 'EPA', 'WPA',
  // Puerto Rico
  'PR',
  // Texas Sections
  'TX', 'NTX', 'STX', 'WTX',
  // Virginia
  'VA',
  // Washington Sections
  'WA','EWA', 'WWA',
  // US Virgin Islands
  'VI',
  // Canadian Provinces
  'AB', 'BC', 'GH', 'MB', 'NB', 'NL', 'NS', 'ONE', 'ONN', 'ONS', 'PE', 'QC', 'SK',
  // Territories
  'TER', 'NT', 'YT', 'NU',
  // International
  'DX'
]);

function parseCabrilloFiles(directory) {
  const results = [];

  let files;
  try {
    files = fs.readdirSync(directory);
  } catch (err) {
    console.error(`Error reading directory: ${err.message}`);
    process.exit(1);
  }

  for (const file of files) {
    const filePath = path.join(directory, file);

    // Skip directories
    if (fs.statSync(filePath).isDirectory()) continue;

    let content;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch (err) {
      console.warn(`Skipping ${file}: could not read file (${err.message})`);
      continue;
    }

    // Only process files that start with START-OF-LOG:
    if (!content.trimStart().startsWith('START-OF-LOG:')) continue;

    const lines = content.split(/\r?\n/);

    let contest = null;
    let callsign = null;
    let location = null;
    let categoryOperator = null;
    let categoryPower = null;
    let club = null;
    let soapbox = null;
    const qsoRecords = [];

    for (const line of lines) {
      if (!contest) {
        const m = line.match(/^CONTEST:\s*(.+)/i);
        if (m) contest = m[1].trim();
      }
      if (!callsign) {
        const m = line.match(/^CALLSIGN:\s*(.+)/i);
        if (m) callsign = m[1].trim();
      }
      if (!location) {
        const m = line.match(/^LOCATION:\s*(.+)/i);
        if (m) location = m[1].trim().toUpperCase();
      }
      if (!categoryOperator) {
        const m = line.match(/^CATEGORY-OPERATOR:\s*(.+)/i);
        if (m) categoryOperator = m[1].trim();
      }
      if (!categoryPower) {
        const m = line.match(/^CATEGORY-POWER:\s*(.+)/i);
        if (m) categoryPower = m[1].trim();
      }
      if (!club) {
        const m = line.match(/^CLUB:\s*(.+)/i);
        if (m) club = m[1].trim();
      }
      if (!soapbox) {
        const m = line.match(/^SOAPBOX:\s*(.*)/i);
        if (m) soapbox = m[1].trim();
      }
      if (line.startsWith('QSO:')) {
        const qso = parseQsoLine(line);
        if (qso) qsoRecords.push(qso);
      }
    }

    // Normalize categoryPower: convert watts to category, default to LOW
    categoryPower = normalizeCategoryPower(categoryPower);

    const scoring = scoreLog(location, qsoRecords, categoryPower);

    results.push({
      file,
      callsign:         callsign         ?? '(not found)',
      contest:          contest          ?? '(not found)',
      location:         location         ?? '(not found)',
      categoryOperator: categoryOperator ?? '(not found)',
      categoryPower,
      club:             club             ?? '(not found)',
      soapbox:          soapbox          ?? '(not found)',
      scoring,
    });
  }

  return results;
}

// --- Helpers ---
function parseQsoLine(line) {
  const fields = line.trim().split(/\s+/);

  if (fields.length < 11 || fields[0] !== 'QSO:') {
    return null;
  }

  const band = frequencyToBand(fields[1]);

  return {
    frequency: fields[1],
    band,
    mode: fields[2],
    date: fields[3],
    time: fields[4],
    fromCall: fields[5].toUpperCase(),
    fromRst: fields[6],
    fromLoc: fields[7].toUpperCase(),
    toCall: fields[8].toUpperCase(),
    toRst: fields[9],
    toLoc: fields[10].toUpperCase(),
  };
}

function frequencyToBand(frequency) {
  const value = Number.parseInt(frequency, 10);

  if (Number.isNaN(value)) return null;
  if (value >= 1800 && value <= 2000) return '160M';
  if (value >= 3500 && value <= 4000) return '80M';
  if (value >= 7000 && value <= 7300) return '40M';
  if (value >= 14000 && value <= 14350) return '20M';
  if (value >= 21000 && value <= 21450) return '15M';
  if (value >= 28000 && value <= 29700) return '10M';
  if (value >= 50000 && value <= 54000) return '6M';
  if (value >= 144000 && value <= 148000) return '2M';

  return null;
}

function normalizeSection(value) {
  const normalized = (value ?? '').trim().toUpperCase();
  return VALID_SECTIONS.has(normalized) ? normalized : 'DX';
}

function normalizeCategoryPower(value) {
  if (!value || value === '' || value === '(not found)') {
    return 'LOW'; // Default to LOW if not provided
  }

  const normalized = (value ?? '').trim().toUpperCase();
  
  // If already a valid category, return it
  if (normalized === 'QRP' || normalized === 'LOW' || normalized === 'HIGH') {
    return normalized;
  }

  // Try to parse as watts
  const watts = Number.parseInt(normalized, 10);
  if (!Number.isNaN(watts)) {
    if (watts <= 5) return 'QRP';
    if (watts <= 100) return 'LOW';
    return 'HIGH';
  }

  // Default to LOW for unrecognized values
  return 'LOW';
}

function getPowerMultiplier(categoryPower) {
  const normalized = (categoryPower ?? 'LOW').trim().toUpperCase();
  switch (normalized) {
    case 'QRP': return 3;
    case 'LOW': return 2;
    case 'HIGH': return 1;
    default: return 2; // Default to LOW multiplier
  }
}

function scoreLog(location, qsoRecords, categoryPower) {
  const normalizedLocation = (location ?? '').trim().toUpperCase();
  const uniqueQsoMap = new Map();

  for (const qso of qsoRecords) {
    if (!qso.band || !qso.toCall) continue;
    const key = `${qso.toCall}|${qso.band}`;
    if (!uniqueQsoMap.has(key)) {
      uniqueQsoMap.set(key, qso);
    }
  }

  const uniqueQsos = [...uniqueQsoMap.values()];
  const qsoLocations = uniqueQsos.map((qso) => qso.toLoc);
  
  // Calculate Total-QSO Mult: PH = 1 point, CW/RY = 2 points each
  let totalQsoMultiplier = 0;
  for (const qso of uniqueQsos) {
    const mode = (qso.mode ?? '').trim().toUpperCase();
    const weight = VALID_MODES.has(mode) ? VALID_MODES.get(mode) : 0;
    totalQsoMultiplier += weight;
  }

  // Get power multiplier
  const powerMultiplier = getPowerMultiplier(categoryPower);

  if (DELAWARE_LOCATIONS.has(normalizedLocation)) {
    const multipliers = [...new Set(qsoLocations.map(normalizeSection))].sort();
    const totalScore = powerMultiplier * totalQsoMultiplier * multipliers.length;
    return {
      scheme: 'Delaware',
      powerMultiplier,
      totalQsoMultiplier,
      multiplierLabel: 'States/Provinces',
      multiplierCount: multipliers.length,
      multipliers,
      totalScore,
    };
  }

  const multipliers = [...new Set(
    qsoLocations
      .map((value) => (value ?? '').trim().toUpperCase())
      .filter((value) => DELAWARE_LOCATIONS.has(value))
  )].sort();

  const adjustedTotalQsoMultiplier = totalQsoMultiplier * 10;  // Multiply by 10 for non-Delaware
  const totalScore = powerMultiplier * adjustedTotalQsoMultiplier * multipliers.length;

  return {
    scheme: 'Non-Delaware',
    powerMultiplier,
    totalQsoMultiplier: adjustedTotalQsoMultiplier,
    multiplierLabel: 'Delaware Counties',
    multiplierCount: multipliers.length,
    multipliers,
    totalScore,
  };
}

function wrapText(text, width) {
  const words = text.split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    if (current.length === 0) {
      current = word;
    } else if (current.length + 1 + word.length <= width) {
      current += ' ' + word;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// --- Entry point ---
const directory = process.argv[2];

if (!directory) {
  console.error('Usage: node tabulator.js <directory>');
  process.exit(1);
}

const results = parseCabrilloFiles(path.resolve(directory));

if (results.length === 0) {
  console.log('No Cabrillo log files found in the specified directory.');
} else {
  console.log(`\nFound ${results.length} Cabrillo log file(s):\n`);
  for (const { file, callsign, contest, location, categoryOperator, categoryPower, club, soapbox, scoring } of results) {
    const soapboxLines = soapbox !== '(not found)' ? wrapText(soapbox, 40) : ['(not found)'];
    console.log(`File:              ${file}`);
    console.log(`  Callsign:        ${callsign}`);
    console.log(`  Contest:         ${contest}`);
    console.log(`  Location:        ${location}`);
    console.log(`  Category-Op:     ${categoryOperator}`);
    console.log(`  Category-Power:  ${categoryPower}`);
    console.log(`  Club:            ${club}`);
    console.log(`  Scoring:         ${scoring.scheme}`);
    console.log(`  Power Multiplier: ${scoring.powerMultiplier}x (${categoryPower})`);
    console.log(`  Total-QSO Points: ${scoring.totalQsoMultiplier}`);
    console.log(`  ${scoring.multiplierLabel}: ${scoring.multiplierCount}`);
    console.log(`  Multipliers:     ${scoring.multipliers.join(', ') || '(none)'}`);
    console.log(`  Total Score:     ${scoring.totalScore}`);
    console.log(`  Soapbox:         ${soapboxLines[0]}`);
    for (let i = 1; i < soapboxLines.length; i++) {
      console.log(`                   ${soapboxLines[i]}`);
    }
    console.log();
  }
}
