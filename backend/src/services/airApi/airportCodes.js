/**
 * Indian city name → IATA airport code mapping.
 *
 * Used to translate user-friendly city names from travel requests
 * (e.g. "Chennai", "Mumbai") into the 3-letter IATA codes the Air API requires.
 * Falls back to first-3-chars uppercase if no match is found.
 */
const CITY_TO_IATA = {
  'agartala':        'IXA',
  'ahmedabad':       'AMD',
  'aizawl':          'AJL',
  'amritsar':        'ATQ',
  'aurangabad':      'IXU',
  'bagdogra':        'IXB',
  'bangalore':       'BLR',
  'bengaluru':       'BLR',
  'bhopal':          'BHO',
  'bhubaneswar':     'BBI',
  'chandigarh':      'IXC',
  'chennai':         'MAA',
  'coimbatore':      'CJB',
  'darbhanga':       'DBR',
  'dehradun':        'DED',
  'delhi':           'DEL',
  'new delhi':       'DEL',
  'dibrugarh':       'DIB',
  'dimapur':         'DMU',
  'goa':             'GOI',
  'gorakhpur':       'GOP',
  'guwahati':        'GAU',
  'gwalior':         'GWL',
  'hubli':           'HBX',
  'hyderabad':       'HYD',
  'imphal':          'IMF',
  'indore':          'IDR',
  'jabalpur':        'JLR',
  'jaipur':          'JAI',
  'jammu':           'IXJ',
  'jodhpur':         'JDH',
  'jorhat':          'JRH',
  'kannur':          'CNN',
  'kanpur':          'KNU',
  'kochi':           'COK',
  'cochin':          'COK',
  'kolhapur':        'KLH',
  'kolkata':         'CCU',
  'kozhikode':       'CCJ',
  'calicut':         'CCJ',
  'leh':             'IXL',
  'lucknow':         'LKO',
  'madurai':         'IXM',
  'mangalore':       'IXE',
  'mangaluru':       'IXE',
  'mumbai':          'BOM',
  'mysore':          'MYQ',
  'mysuru':          'MYQ',
  'nagpur':          'NAG',
  'patna':           'PAT',
  'port blair':      'IXZ',
  'pune':            'PNQ',
  'raipur':          'RPR',
  'rajkot':          'RAJ',
  'ranchi':          'IXR',
  'shillong':        'SHL',
  'shimla':          'SLV',
  'silchar':         'IXS',
  'srinagar':        'SXR',
  'surat':           'STV',
  'thiruvananthapuram': 'TRV',
  'trivandrum':      'TRV',
  'tiruchirappalli':  'TRZ',
  'trichy':          'TRZ',
  'tirupati':        'TIR',
  'tuticorin':       'TCR',
  'udaipur':         'UDR',
  'vadodara':        'BDQ',
  'varanasi':        'VNS',
  'vijayawada':      'VGA',
  'visakhapatnam':   'VTZ',
  'vizag':           'VTZ',
}

/**
 * Resolve a city name or airport code to a 3-letter IATA code.
 * - If already a 3-letter code (e.g. "BOM"), returns as-is in uppercase.
 * - If a known city name, returns the mapped code.
 * - Otherwise falls back to first 3 chars uppercase.
 */
function resolveAirportCode (input) {
  if (!input) return ''
  const trimmed = input.trim()

  // Already looks like an IATA code
  if (/^[A-Z]{3}$/i.test(trimmed) && trimmed.length === 3) {
    return trimmed.toUpperCase()
  }

  const key = trimmed.toLowerCase()
  if (CITY_TO_IATA[key]) return CITY_TO_IATA[key]

  // Partial match: "New Delhi" → "new delhi", "Bengaluru" → "bengaluru"
  for (const [city, code] of Object.entries(CITY_TO_IATA)) {
    if (key.includes(city) || city.includes(key)) return code
  }

  // Fallback
  return trimmed.substring(0, 3).toUpperCase()
}

module.exports = { resolveAirportCode, CITY_TO_IATA }
