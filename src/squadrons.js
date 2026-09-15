/** Squadron definitions for SOS Project X flight letter prefixes. */
export const SQUADRONS = [
  {
    id: 'knights',
    name: 'Knights',
    unit: '30th Student Squadron',
    motto: 'Excalibur',
    prefix: 'A',
    rangeLabel: 'A1–A15',
    logo: 'squadrons/knights.jpg',
    accent: '#c62828',
  },
  {
    id: 'bulls',
    name: 'Bulls',
    unit: '31st Student Squadron',
    motto: 'Vereor Taurus',
    prefix: 'B',
    rangeLabel: 'B16–B30',
    logo: 'squadrons/bulls.jpg',
    accent: '#7b1a1a',
  },
  {
    id: 'centurions',
    name: 'Centurions',
    unit: '32d Student Squadron',
    motto: 'Strength and Honor',
    prefix: 'C',
    rangeLabel: 'C31–C46',
    logo: 'squadrons/centurions.jpg',
    accent: '#1b5e20',
  },
  {
    id: 'tigers',
    name: 'Tigers',
    unit: '33d Student Squadron',
    motto: 'Everyone a Tiger',
    prefix: 'F',
    rangeLabel: 'F60–F75',
    logo: 'squadrons/tigers.jpg',
    accent: '#f9a825',
  },
]

export function squadronForFlightId(flightId) {
  const letter = String(flightId || '').trim().charAt(0).toUpperCase()
  return SQUADRONS.find((s) => s.prefix === letter) || null
}

export function flightsForSquadron(flights, squadronId) {
  const squadron = SQUADRONS.find((s) => s.id === squadronId)
  if (!squadron) return []
  return flights.filter((f) => f.id.toUpperCase().startsWith(squadron.prefix))
}
