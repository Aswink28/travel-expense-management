/* ── HotelService — mock hotel search ── */

const HOTEL_NAMES = [
  'The Grand Palace', 'Residency Comforts', 'Hotel Royal Park', 'Comfort Inn Suites',
  'The Metropolitan', 'Zaith Residency', 'Saaral Residency', 'V7 Hotel',
  'The Mount Manor', 'City Square Hotel', 'Premier Inn', 'The Lalit',
  'Radisson Blu', 'Lemon Tree Hotel', 'FabHotel Prime', 'OYO Flagship',
  'Holiday Inn Express', 'Marriott Courtyard', 'Ibis Styles', 'Novotel Suites',
]

const AMENITY_POOL = ['Free WiFi', 'Restaurant', 'Swimming Pool', 'Gym', 'Internet', 'Business Center', 'Bar', 'Laundry', 'Room Service', 'Parking', 'Spa', 'Conference Room']

const LOCATIONS_BY_CITY = {
  chennai:   ['Anna Nagar', 'T. Nagar', 'Adyar', 'Velachery', 'Alwarpet', 'Egmore', 'Nungambakkam', 'Thousand Lights', 'Porur', 'Chromepet', 'Alandur', 'Arumbakkam'],
  mumbai:    ['Bandra', 'Andheri', 'Powai', 'Colaba', 'Worli', 'Juhu', 'Dadar', 'Kurla', 'Borivali', 'Thane'],
  delhi:     ['Connaught Place', 'Karol Bagh', 'Aerocity', 'Saket', 'Dwarka', 'Rohini', 'Lajpat Nagar', 'Noida'],
  bangalore: ['Koramangala', 'Indiranagar', 'Whitefield', 'Electronic City', 'MG Road', 'Jayanagar', 'Marathahalli'],
  hyderabad: ['Banjara Hills', 'Jubilee Hills', 'Hitech City', 'Gachibowli', 'Secunderabad', 'Kukatpally'],
  kolkata:   ['Park Street', 'Salt Lake', 'New Town', 'Ballygunge', 'Howrah', 'Dum Dum'],
  pune:      ['Koregaon Park', 'Viman Nagar', 'Kothrud', 'Hinjewadi', 'Hadapsar', 'Camp'],
  ahmedabad: ['SG Highway', 'CG Road', 'Navrangpura', 'Prahlad Nagar', 'Vastrapur'],
}

function seededRand(seed, min, max) {
  const x = Math.sin(seed) * 10000
  return min + Math.floor((x - Math.floor(x)) * (max - min + 1))
}

function getLocations(city) {
  const key = city.toLowerCase().split(',')[0].trim()
  for (const k of Object.keys(LOCATIONS_BY_CITY)) {
    if (key.includes(k) || k.includes(key)) return LOCATIONS_BY_CITY[k]
  }
  return ['City Center', 'Downtown', 'Business District', 'Airport Zone', 'Old Town', 'Commercial Street']
}

function generateHotels(city, checkIn, checkOut, rooms, guests) {
  const nights = Math.max(1, Math.ceil((new Date(checkOut) - new Date(checkIn)) / (1000 * 60 * 60 * 24)))
  const locations = getLocations(city)
  const cityLabel = city.split(',')[0].trim()
  const stateLabel = city.split(',')[1]?.trim() || 'India'
  const count = 12 + seededRand(city.charCodeAt(0) || 67, 0, 54)  // 12-66 hotels

  return Array.from({ length: count }, (_, i) => {
    const seed = (city.charCodeAt(0) || 67) * 100 + i
    const stars = seededRand(seed, 1, 5)
    const basePrice = 800 + stars * 500 + seededRand(seed + 1, 0, 1200)
    const amenityCount = 3 + seededRand(seed + 2, 0, 6)
    const amenities = [...AMENITY_POOL].sort(() => Math.sin(seed + AMENITY_POOL.indexOf(AMENITY_POOL[0])) - 0.5).slice(0, amenityCount)
    const loc = locations[i % locations.length]
    const hotelName = HOTEL_NAMES[i % HOTEL_NAMES.length] + (i >= HOTEL_NAMES.length ? ` ${Math.floor(i / HOTEL_NAMES.length) + 1}` : '')

    return {
      hotelId:    `HTL-${seed}`,
      name:       hotelName,
      stars,
      location:   loc,
      city:       cityLabel,
      state:      stateLabel,
      address:    `${seededRand(seed + 3, 1, 999)}-${seededRand(seed + 4, 1, 50)} ${loc}, ${cityLabel}`,
      amenities,
      image:      null,
      roomType:   'Room Only',
      pricePerNight: basePrice,
      totalPrice:  basePrice * nights,
      nights,
      rooms:      parseInt(rooms) || 1,
    }
  })
}

module.exports = { generateHotels }
