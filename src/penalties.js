/**
 * Task-specific Project X penalties (26D notetakers).
 * label = 2–3 words for fast tap during live execution
 * detail = full rule text (shown on long-press / title)
 * tone = color family (red-* for touch-red fouls)
 */

function p(label, detail, tone) {
  return { label, detail, tone }
}

export const TASK_PENALTIES = {
  '1A': [
    p('Person fall', 'Anyone falls into the water, to the ground, or touches black padding. (30/RTB)', 'water'),
    p('Drop equipment', 'Equipment falls into the water or to the ground (dropped. Eqpt is out of control.) (30/RTT)', 'drop'),
    p('Padding support', 'Using the black padding to support equipment. Equipment may touch black padding if the load is supported by a rope or other means. (30/RTT)', 'padding'),
    p('Rough dummy', 'Roughly handling dummy/removing the dummy from the stretcher. (60)', 'rough'),
    p('Missing gear', "The team doesn't take all of the equipment with them. (Incomplete)", 'incomplete'),
  ],
  '2A': [
    p('Person fall', 'Anyone falls into the water or touches black padding. (60/RTB)', 'water'),
    p('Drop equipment', 'Any equipment falls into the water (60/RTT)', 'drop'),
    p('Drag board', 'Students drag board on bottom of pool instead of holding it. (60)', 'padding'),
    p('Missing gear', "They don't take all their equipment. (Incomplete)", 'incomplete'),
  ],
  '3A': [
    p('Touch red', 'Anyone or equipment touches red area or black padding. (30)', 'red-any'),
    p('Rough box', 'Rough handling the ammo box. (30)', 'rough'),
    p('Touch water', 'Anyone or any equipment touches the water (raw sewage). (60/RTB/RTT)', 'water'),
    p('Missing gear', "They don't take all equipment. (Incomplete)", 'incomplete'),
  ],
  '4A': [
    p('Gear red', 'Equipment touches red, water, black padding, or minefield. (Except rope in minefield – if whole coil of rope falls in minefield that is a penalty) (30)', 'red-equip'),
    p('Drop water', 'Anything (keys, gravel, coins, etc) falls into water. (30/RTT)', 'drop'),
    p('Person red', 'Anyone touches red, water, black padding, or minefield. (30/RTB)', 'red-person'),
  ],
  '5A': [
    p('Touch red', 'Anyone or anything touches a red area. (30)', 'red-any'),
  ],
  '6A': [
    p('Person red', 'Anyone (including the dummy), touches ground, black padding, red area, or falls in the water. (30/RTB)', 'red-person'),
    p('Drop water', 'Equipment falls into water. (30/RTT)', 'drop'),
    p('Rough dummy', 'Roughly handling the dummy (60)', 'rough'),
    p('Too loud', 'Anyone talks loud enough to be heard by team members on the opposite platform. (60)', 'noise'),
    p('Solo carry', 'A single person is carrying the dummy across the river (60/RTB for person and dummy)', 'carry'),
    p('Missing gear', 'Not taking all equipment. (Incomplete)', 'incomplete'),
  ],
  '7A': [
    p('Touch acid', 'Anyone touches the acid, either side of the bath, or sensor field. (60)', 'acid'),
    p('Too loud', 'Making a loud noise, dragging pipes, sliding cans along bottom of pool, or not whispering. (60)', 'noise'),
    p('Acid drip', 'Dripping acid across their toes. (60)', 'acid'),
    p('Drop pipe', 'Dropping (loses control of) pipe(s) (60 – do not return pipe to students)', 'drop'),
  ],
  '8A': [
    p('Rough drum', 'Roughly handling the drum. (30)', 'rough'),
    p('Person red', 'Anyone touches red or the minefield. (60/RTB)', 'red-person'),
    p('Gear red', 'Equipment touches red or minefield. (The rope in a minefield is not a foul) (60)', 'red-equip'),
    p('Missing drum', 'Failure to take drum. (Incomplete)', 'incomplete'),
  ],
  '9A': [
    p('Person red', 'Anyone touches red or comes to rest on the ground. (60/RTB)', 'red-person'),
    p('Gear ground', 'Equipment rests on the ground between the edges of the gorge. (Except if they intend to destroy equipment) (60/RTT)', 'mine'),
    p('Live wire', 'The box touches electrified power lines with a person touching the box. (60/RTB/RTT)', 'red-any'),
    p('Missing gear', "They don't take or destroy the equipment, or don't take the box of tools. (Incomplete)", 'incomplete'),
  ],
  '10A': [
    p('Person red', 'Anyone touches red, wire, or the ground between the red lines. (60/RTB)', 'red-person'),
    p('Gear red', 'Any equipment touches red, wire or the ground between the red lines. (60)', 'red-equip'),
    p('Rough drums', 'Roughly handling drums. (60)', 'rough'),
    p('Missing drums', "They don't take the drums. (Incomplete)", 'incomplete'),
  ],
  '11A': [
    p('Too loud', 'Anyone talks above a whisper or makes a loud noise with equipment. (30)', 'noise'),
    p('Gear red', 'Anything (including ropes) touches red or the ground within the red area. (60)', 'red-equip'),
    p('Person red', 'Anyone touches red or the ground within the red area. (60/RTB)', 'red-person'),
  ],
  '12A': [
    p('Person red', "Anyone touches red walls, mined area, electrical cable, or box while it's touching the electrical cable. (60/RTB)", 'red-person'),
    p('Gear red', 'Equipment touches the mined area or the red walls. (60)', 'red-equip'),
    p('Missing box', "They don't take the box. (Incomplete)", 'incomplete'),
  ],
  '13A': [
    p('Rough box', 'Roughly handling the box or box touches mined area. (30)', 'rough'),
    p('Person red', 'Anyone touches mined area or red. (30/RTB)', 'red-person'),
    p('Box red', 'Box touches red with student touching box. (30/RTB)', 'red-any'),
    p('Lost gear', "Equipment falls to the ground and can't be retrieved. (60/RTT)", 'drop'),
    p('Missing gear', "They don't take the ropes and the box. (Incomplete)", 'incomplete'),
  ],
  '14A': [
    p('Gear red', 'Equipment touches red or the mined (IED) area. (30)', 'red-equip'),
    p('Person red', 'Anyone touches red or mined (IED) area. (30/RTB)', 'red-person'),
    p('Rough dummy', 'Roughly handling the dummy/removing the dummy from the stretcher. (60)', 'rough'),
    p('Missing gear', "The team doesn't take all equipment. (Incomplete)", 'incomplete'),
  ],
  '15A': [
    p('Person red', 'Anyone touches red or mined area. (30/RTB)', 'red-person'),
    p('Gear red', 'Anything touches red or mined area. (30)', 'red-equip'),
    p('Rough drum', 'Roughly handling the drum. (30)', 'rough'),
    p('Missing gear', 'The team fails to take all of the equipment. (Incomplete)', 'incomplete'),
  ],
  '16A': [
    p('Person red', 'Anyone falls into the water, touches red, or black padding. (30/RTB)', 'red-person'),
    p('Gear red', 'Equipment falls into the water, touches red, or black padding. (30/RTT)', 'red-equip'),
    p('Missing box', "They don't get box across. (Incomplete)", 'incomplete'),
  ],
  '17A': [
    p('Person red', 'Anyone touches the water, black padding on edges of moat, red, or electric cable. (60/RTB)', 'red-person'),
    p('Touch padding', 'Any equipment touches black padding around the edge of the moat. (60)', 'padding'),
    p('Drop board', 'Drops (loses control of) board in water (60/RTT)', 'drop'),
    p('Drum red', 'The drum touches a red beam with the student touching the drum. (60/RTB) (After foul, remove drum from cable)', 'red-any'),
  ],
  '18A': [
    p('Person red', 'Anyone touches the water, black padding, or red. (30/RTB)', 'red-person'),
    p('Gear red', 'Equipment touches water, black padding, or red. (30/RTT)', 'red-equip'),
    p('Missing gear', "They don't take all the equipment. (Incomplete)", 'incomplete'),
  ],
  '19A': [
    p('Touch red', 'Anyone or any equipment touches a red, black padded, or mined area. (30/RTB)', 'red-any'),
    p('Person fall', 'Anyone falls into the water or stands on bottom of stream. (30/RTB)', 'water'),
    p('Drop water', 'Any equipment falls into the water. (60/RTT)', 'drop'),
    p('Rough box', 'Roughly handling the box of electronic equipment (60)', 'rough'),
    p('Missing box', 'Not taking the box of electronic equipment. (Incomplete)', 'incomplete'),
  ],
  '20A': [
    p('Gear red', 'Equipment touches red, black padding, or the water. (30)', 'red-equip'),
    p('Person red', 'Anyone touches red, black padding, or water. (30/RTB)', 'red-person'),
    p('Too loud', 'Talking above a whisper (until through the pipe). (30)', 'noise'),
  ],
  '21A': [
    p('Person red', 'Anyone touches red, black padding, or falls into the water. (30/RTB)', 'red-person'),
    p('Gear red', 'Equipment touches red or black padding. (30)', 'red-equip'),
    p('Drop water', 'Equipment falls in the water. (60/RTT)', 'drop'),
  ],
  '22A': [
    p('Person red', 'Anyone touches red, black padding, or mined area. (30/RTB)', 'red-person'),
    p('Gear red', 'Equipment touches red, black padding, or mined area. (30/RTT)', 'red-equip'),
    p('Missing gear', "They don't take all their equipment. (Incomplete)", 'incomplete'),
  ],
  '1B': [
    p('Padding support', 'Using the black padding to support equipment. Equipment may touch black padding if the load is supported by a rope or other means. (30/RTT)', 'padding'),
    p('Drop equipment', 'Equipment falls into the water or to the ground (dropped. Eqpt is out of control). (60/RTT)', 'drop'),
    p('Person fall', 'Anyone falls into the water, to the ground, or touches black padding. (60/RTB)', 'water'),
    p('Missing serum', 'Failure to bring box of serum. (Incomplete)', 'incomplete'),
  ],
  '2B': [
    p('Person fall', 'Anyone falls into the water or touches black padding. (60/RTB)', 'water'),
    p('Drop equipment', 'Any equipment falls into the water. (60/RTT)', 'drop'),
    p('Drag board', 'Students drag board on bottom of pool instead of holding it. (60)', 'padding'),
    p('Loose supplies', 'Failure to keep supplies in the wheelbarrow. (60)', 'drop'),
    p('Missing gear', 'Not taking all equipment. (Incomplete)', 'incomplete'),
  ],
  '3B': [
    p('Touch red', 'Anyone or equipment touches red area or black padding. (30)', 'red-any'),
    p('Rough box', 'Roughly handling the box of explosives. (30)', 'rough'),
    p('Person water', 'Anyone touches the water. (60/RTB)', 'water'),
    p('Drop water', 'Anything (keys, gravel, coins, etc) touches or is dropped in the water. (60/RTT)', 'drop'),
    p('Missing gear', 'Not taking all equipment. (Incomplete)', 'incomplete'),
  ],
  '4B': [
    p('Gear red', 'Equipment touches red, water, black padding, or the sensor field. (Except rope in minefield – if whole coil of rope falls in minefield that is a penalty) (30/RTT)', 'red-equip'),
    p('Drop water', 'Anything (keys, gravel, coins, etc) falls into water. (30)', 'drop'),
    p('Person red', 'Anyone touches red, water, black padding, or the sensor field on the ground. (30/RTB)', 'red-person'),
  ],
  '5B': [
    p('Rough scientist', 'Roughly handling the scientist. (30)', 'rough'),
    p('Touch red', 'Anyone or anything touches a red area (until alarm is repositioned). (30)', 'red-any'),
    p('Fall water', 'Anyone/Anything falls into the water. (30/RTB/RTT)', 'water'),
    p('Touch mine', 'Anyone touches the mined area, pool, or gets splashed (wet plank may be touched). (60)', 'mine'),
    p('Gear mine', 'Equipment touches mined area. (60)', 'mine'),
    p('Team room', "Entire team isn't in the chemical room when switch is turned off. (60)", 'noise'),
    p('Missing scientist', 'Not getting the scientist out of the plant. (Incomplete)', 'incomplete'),
  ],
  '6B': [
    p('Person red', 'Anyone (including the dummy) touches ground, black padding, red area, or falls into the water. (30/RTB)', 'red-person'),
    p('Rough dummy', 'Roughly handling the dummy (30)', 'rough'),
    p('Drop water', 'Equipment falls into water. (30/RTT)', 'drop'),
    p('Too loud', 'Anyone talks loud enough to be heard by team members on the opposite platform. (60)', 'noise'),
    p('Solo carry', 'A single person is carrying the dummy across the river (60/RTB for person and dummy)', 'carry'),
    p('Missing gear', 'Not taking all the equipment. (Incomplete)', 'incomplete'),
  ],
  '7B': [
    p('Touch acid', 'Anyone touches the acid, either side of the bath, or sensor field. (60)', 'acid'),
    p('Too loud', 'Making a loud noise, dragging pipes, sliding cans along bottom of pool, or not whispering. (60)', 'noise'),
    p('Acid drip', 'Dripping acid across their toes. (60)', 'acid'),
    p('Drop pipe', 'Dropping (loses control of) pipe(s) (60 – do not return pipe to students)', 'drop'),
  ],
  '8B': [
    p('Person red', 'Anyone touches red or minefield. (60/RTB)', 'red-person'),
    p('Gear red', 'Equipment touches red or minefield. (The rope in a minefield is not a foul) (60)', 'red-equip'),
    p('Rough dummy', 'Roughly handling the dummy; not using the stretcher. (60)', 'rough'),
    p('Missing dummy', 'Failure to bring the dummy. (Incomplete)', 'incomplete'),
  ],
  '9B': [
    p('Person red', 'Anyone touches red or comes to rest on the ground. (60/RTB)', 'red-person'),
    p('Gear ground', 'Equipment rests on the ground between the edges of the gorge. (Except if they intend to destroy equipment) (60/RTT)', 'mine'),
    p('Missing gear', 'Not taking or destroying equipment. (Incomplete)', 'incomplete'),
  ],
  '10B': [
    p('Person red', 'Anyone touches red, wire, or area between the red rails. (60/RTB)', 'red-person'),
    p('Gear red', 'Equipment touches red, wire, or area between the red rails. (60)', 'red-equip'),
    p('Rough dummy', 'Roughly handling dummy/removing the dummy from the stretcher. (60)', 'rough'),
    p('Missing dummy', 'Failure to bring the dummy. (Incomplete)', 'incomplete'),
  ],
  '11B': [
    p('Too loud', 'Anyone talks above a whisper or makes a loud noise with equipment. (30)', 'noise'),
    p('Gear red', 'Anything (including ropes) touches red or the ground inside the red area. (60)', 'red-equip'),
    p('Person red', 'Anyone touches red or the ground inside the red area. (60/RTB)', 'red-person'),
    p('Missing drum', 'Failure to bring the drum. (Incomplete)', 'incomplete'),
  ],
  '12B': [
    p('Gear red', 'Equipment touches red or mined area. (60)', 'red-equip'),
    p('Person red', 'Anyone touches red, mined area, or electric cable. (60/RTB)', 'red-person'),
    p('Too loud', 'Anyone talks above a whisper. (60)', 'noise'),
  ],
  '13B': [
    p('Person red', 'Anyone touches mined area or red. (30/RTB)', 'red-person'),
    p('Lost rope', "The rope falls to the ground and can't be retrieved. (60/RTT)", 'drop'),
    p('Missing rope', "The team doesn't take the rope. (Incomplete)", 'incomplete'),
  ],
  '14B': [
    p('Gear red', 'Equipment touches red or mined area. (60)', 'red-equip'),
    p('Person red', 'Anyone touches red or mined area. (60/RTB)', 'red-person'),
    p('Box mine', 'The box is dragged/dropped in the minefield. (60/RTB/RTT)', 'mine'),
    p('Missing gear', "The team doesn't take all equipment. (Incomplete)", 'incomplete'),
  ],
  '15B': [
    p('Person red', 'Anyone touches red or mined area. (30/RTB)', 'red-person'),
    p('Gear red', 'Anything touches red or mined area. (30)', 'red-equip'),
    p('Rough drum', 'Roughly handling the drum. (30)', 'rough'),
    p('Missing gear', 'The team fails to take all of the equipment. (Incomplete)', 'incomplete'),
  ],
  '16B': [
    p('Touch red', 'Anyone or equipment, except rope, touches a red area or black padding. (30)', 'red-any'),
    p('Person water', 'Anyone touches or falls into the water. (30/RTB)', 'water'),
    p('Drop water', 'Equipment falls into water (except if they intend to destroy equipment) (30/RTT)', 'drop'),
    p('Missing gear', 'Not taking or destroying equipment. (Incomplete)', 'incomplete'),
  ],
  '17B': [
    p('Person red', 'Anyone touches the water, black padding on edges of moat, red, or electric cable. (60/RTB)', 'red-person'),
    p('Touch padding', 'Any equipment touches black padding on edges of the moat. (60)', 'padding'),
    p('Drop board', 'Drops (loses control of) board in water. (60/RTT)', 'drop'),
    p('Drum red', 'The drum touches a red beam with a person touching the drum. (60/RTB) (Remove drum from beam after foul)', 'red-any'),
  ],
  '18B': [
    p('Person red', 'Anyone touches red, black padding, or falls into the water. (30/RTB)', 'red-person'),
    p('Gear red', 'Any equipment touches red, black padding, or falls into water. (30/RTT)', 'red-equip'),
    p('Missing gear', "They don't take the equipment. (Incomplete)", 'incomplete'),
  ],
  '19B': [
    p('Touch red', 'Anyone or any equipment touches red or black padded area. (30)', 'red-any'),
    p('Touch mine', 'Anyone or anything touches mined area. (30/RTB/RTT)', 'mine'),
    p('Person fall', 'Anyone falls into the water or stands on bottom of stream. (30/RTB)', 'water'),
    p('Drop water', 'Equipment falls into the water. (60/RTT)', 'drop'),
    p('Rough box', 'Roughly handling or throwing the box. (60)', 'rough'),
    p('Missing gear', "They don't take all the equipment. (Incomplete)", 'incomplete'),
  ],
  '20B': [
    p('Person red', 'Anyone touches red, black padding, or falls into water. (30/RTB)', 'red-person'),
    p('Gear red', 'Anything touches red, black padding, or falls into the water (except the plank can fall into water if the rope is tied around it). (30/RTT)', 'red-equip'),
    p('Missing gear', 'Not taking all equipment. (Incomplete)', 'incomplete'),
  ],
  '21B': [
    p('Person red', 'Anyone touches red, black padding, or falls into the water. (30/RTB)', 'red-person'),
    p('Gear red', 'Equipment touches red or black padding. (30)', 'red-equip'),
    p('Drop water', 'Equipment falls in the water. (60/RTT)', 'drop'),
  ],
  '22B': [
    p('Person red', 'Anyone touches red, black padding, or mined area. (30/RTB)', 'red-person'),
    p('Gear red', 'Equipment touches red, black padding, or mined area. (30/RTT)', 'red-equip'),
    p('Rough ammo', 'Rough handling of the ammo boxes. (30)', 'rough'),
    p('Missing ammo', 'Failure to bring ammo boxes. (Incomplete)', 'incomplete'),
  ],
}

export function penaltiesForTask(taskCode) {
  const code = String(taskCode || '').trim().toUpperCase()
  return TASK_PENALTIES[code] || []
}
