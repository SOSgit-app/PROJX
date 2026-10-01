/**
 * Task-specific Project X penalties (26D notetakers).
 * label = 3–4 words for fast tap during live execution
 * detail = full rule text (what gets recorded)
 * tone = color family (red-* for touch-red fouls)
 */

function p(label, detail, tone) {
  return { label, detail, tone }
}

export const TASK_PENALTIES = {
  '1A': [
    p('Person falls / padding', 'Anyone falls into the water, to the ground, or touches black padding. (30/RTB)', 'water'),
    p('Equipment dropped out', 'Equipment falls into the water or to the ground (dropped. Eqpt is out of control.) (30/RTT)', 'drop'),
    p('Padding supports gear', 'Using the black padding to support equipment. Equipment may touch black padding if the load is supported by a rope or other means. (30/RTT)', 'padding'),
    p('Rough dummy handling', 'Roughly handling dummy/removing the dummy from the stretcher. (60)', 'rough'),
    p('Missing all equipment', "The team doesn't take all of the equipment with them. (Incomplete)", 'incomplete'),
  ],
  '2A': [
    p('Person falls / padding', 'Anyone falls into the water or touches black padding. (60/RTB)', 'water'),
    p('Equipment falls water', 'Any equipment falls into the water (60/RTT)', 'drop'),
    p('Dragging board bottom', 'Students drag board on bottom of pool instead of holding it. (60)', 'padding'),
    p('Missing all equipment', "They don't take all their equipment. (Incomplete)", 'incomplete'),
  ],
  '3A': [
    p('Touch red / padding', 'Anyone or equipment touches red area or black padding. (30)', 'red-any'),
    p('Rough ammo box', 'Rough handling the ammo box. (30)', 'rough'),
    p('Touch sewage water', 'Anyone or any equipment touches the water (raw sewage). (60/RTB/RTT)', 'water'),
    p('Missing all equipment', "They don't take all equipment. (Incomplete)", 'incomplete'),
  ],
  '4A': [
    p('Gear touches red', 'Equipment touches red, water, black padding, or minefield. (Except rope in minefield – if whole coil of rope falls in minefield that is a penalty) (30)', 'red-equip'),
    p('Items fall water', 'Anything (keys, gravel, coins, etc) falls into water. (30/RTT)', 'drop'),
    p('Person touches red', 'Anyone touches red, water, black padding, or minefield. (30/RTB)', 'red-person'),
  ],
  '5A': [
    p('Touch red area', 'Anyone or anything touches a red area. (30)', 'red-any'),
  ],
  '6A': [
    p('Person touches red', 'Anyone (including the dummy), touches ground, black padding, red area, or falls in the water. (30/RTB)', 'red-person'),
    p('Equipment falls water', 'Equipment falls into water. (30/RTT)', 'drop'),
    p('Rough dummy handling', 'Roughly handling the dummy (60)', 'rough'),
    p('Talking too loud', 'Anyone talks loud enough to be heard by team members on the opposite platform. (60)', 'noise'),
    p('Solo dummy carry', 'A single person is carrying the dummy across the river (60/RTB for person and dummy)', 'carry'),
    p('Missing all equipment', 'Not taking all equipment. (Incomplete)', 'incomplete'),
  ],
  '7A': [
    p('Touch acid / sensor', 'Anyone touches the acid, either side of the bath, or sensor field. (60)', 'acid'),
    p('Loud noise / whisper', 'Making a loud noise, dragging pipes, sliding cans along bottom of pool, or not whispering. (60)', 'noise'),
    p('Acid drips toes', 'Dripping acid across their toes. (60)', 'acid'),
    p('Dropped pipe control', 'Dropping (loses control of) pipe(s) (60 – do not return pipe to students)', 'drop'),
  ],
  '8A': [
    p('Rough drum handling', 'Roughly handling the drum. (30)', 'rough'),
    p('Person touches red', 'Anyone touches red or the minefield. (60/RTB)', 'red-person'),
    p('Gear touches red', 'Equipment touches red or minefield. (The rope in a minefield is not a foul) (60)', 'red-equip'),
    p('Missing drum taken', 'Failure to take drum. (Incomplete)', 'incomplete'),
  ],
  '9A': [
    p('Person touches red', 'Anyone touches red or comes to rest on the ground. (60/RTB)', 'red-person'),
    p('Gear on ground', 'Equipment rests on the ground between the edges of the gorge. (Except if they intend to destroy equipment) (60/RTT)', 'mine'),
    p('Box hits live wire', 'The box touches electrified power lines with a person touching the box. (60/RTB/RTT)', 'red-any'),
    p('Missing all equipment', "They don't take or destroy the equipment, or don't take the box of tools. (Incomplete)", 'incomplete'),
  ],
  '10A': [
    p('Person touches red', 'Anyone touches red, wire, or the ground between the red lines. (60/RTB)', 'red-person'),
    p('Gear touches red', 'Any equipment touches red, wire or the ground between the red lines. (60)', 'red-equip'),
    p('Rough drum handling', 'Roughly handling drums. (60)', 'rough'),
    p('Missing drums taken', "They don't take the drums. (Incomplete)", 'incomplete'),
  ],
  '11A': [
    p('Talking above whisper', 'Anyone talks above a whisper or makes a loud noise with equipment. (30)', 'noise'),
    p('Gear touches red', 'Anything (including ropes) touches red or the ground within the red area. (60)', 'red-equip'),
    p('Person touches red', 'Anyone touches red or the ground within the red area. (60/RTB)', 'red-person'),
  ],
  '12A': [
    p('Person touches red', "Anyone touches red walls, mined area, electrical cable, or box while it's touching the electrical cable. (60/RTB)", 'red-person'),
    p('Gear touches red', 'Equipment touches the mined area or the red walls. (60)', 'red-equip'),
    p('Missing box taken', "They don't take the box. (Incomplete)", 'incomplete'),
  ],
  '13A': [
    p('Rough box / mine', 'Roughly handling the box or box touches mined area. (30)', 'rough'),
    p('Person touches red', 'Anyone touches mined area or red. (30/RTB)', 'red-person'),
    p('Box touches red', 'Box touches red with student touching box. (30/RTB)', 'red-any'),
    p('Lost unrecovered gear', "Equipment falls to the ground and can't be retrieved. (60/RTT)", 'drop'),
    p('Missing all equipment', "They don't take the ropes and the box. (Incomplete)", 'incomplete'),
  ],
  '14A': [
    p('Gear touches red', 'Equipment touches red or the mined (IED) area. (30)', 'red-equip'),
    p('Person touches red', 'Anyone touches red or mined (IED) area. (30/RTB)', 'red-person'),
    p('Rough dummy handling', 'Roughly handling the dummy/removing the dummy from the stretcher. (60)', 'rough'),
    p('Missing all equipment', "The team doesn't take all equipment. (Incomplete)", 'incomplete'),
  ],
  '15A': [
    p('Person touches red', 'Anyone touches red or mined area. (30/RTB)', 'red-person'),
    p('Gear touches red', 'Anything touches red or mined area. (30)', 'red-equip'),
    p('Rough drum handling', 'Roughly handling the drum. (30)', 'rough'),
    p('Missing all equipment', 'The team fails to take all of the equipment. (Incomplete)', 'incomplete'),
  ],
  '16A': [
    p('Person touches red', 'Anyone falls into the water, touches red, or black padding. (30/RTB)', 'red-person'),
    p('Gear touches red', 'Equipment falls into the water, touches red, or black padding. (30/RTT)', 'red-equip'),
    p('Box not across', "They don't get box across. (Incomplete)", 'incomplete'),
  ],
  '17A': [
    p('Person touches red', 'Anyone touches the water, black padding on edges of moat, red, or electric cable. (60/RTB)', 'red-person'),
    p('Gear touches padding', 'Any equipment touches black padding around the edge of the moat. (60)', 'padding'),
    p('Board dropped water', 'Drops (loses control of) board in water (60/RTT)', 'drop'),
    p('Drum touches red', 'The drum touches a red beam with the student touching the drum. (60/RTB) (After foul, remove drum from cable)', 'red-any'),
  ],
  '18A': [
    p('Person touches red', 'Anyone touches the water, black padding, or red. (30/RTB)', 'red-person'),
    p('Gear touches red', 'Equipment touches water, black padding, or red. (30/RTT)', 'red-equip'),
    p('Missing all equipment', "They don't take all the equipment. (Incomplete)", 'incomplete'),
  ],
  '19A': [
    p('Touch red / mine', 'Anyone or any equipment touches a red, black padded, or mined area. (30/RTB)', 'red-any'),
    p('Person falls stream', 'Anyone falls into the water or stands on bottom of stream. (30/RTB)', 'water'),
    p('Equipment falls water', 'Any equipment falls into the water. (60/RTT)', 'drop'),
    p('Rough electronics box', 'Roughly handling the box of electronic equipment (60)', 'rough'),
    p('Missing electronics box', 'Not taking the box of electronic equipment. (Incomplete)', 'incomplete'),
  ],
  '20A': [
    p('Gear touches red', 'Equipment touches red, black padding, or the water. (30)', 'red-equip'),
    p('Person touches red', 'Anyone touches red, black padding, or water. (30/RTB)', 'red-person'),
    p('Talking above whisper', 'Talking above a whisper (until through the pipe). (30)', 'noise'),
  ],
  '21A': [
    p('Person touches red', 'Anyone touches red, black padding, or falls into the water. (30/RTB)', 'red-person'),
    p('Gear touches red', 'Equipment touches red or black padding. (30)', 'red-equip'),
    p('Equipment falls water', 'Equipment falls in the water. (60/RTT)', 'drop'),
  ],
  '22A': [
    p('Person touches red', 'Anyone touches red, black padding, or mined area. (30/RTB)', 'red-person'),
    p('Gear touches red', 'Equipment touches red, black padding, or mined area. (30/RTT)', 'red-equip'),
    p('Missing all equipment', "They don't take all their equipment. (Incomplete)", 'incomplete'),
  ],
  '1B': [
    p('Padding supports gear', 'Using the black padding to support equipment. Equipment may touch black padding if the load is supported by a rope or other means. (30/RTT)', 'padding'),
    p('Equipment dropped out', 'Equipment falls into the water or to the ground (dropped. Eqpt is out of control). (60/RTT)', 'drop'),
    p('Person falls / padding', 'Anyone falls into the water, to the ground, or touches black padding. (60/RTB)', 'water'),
    p('Missing serum box', 'Failure to bring box of serum. (Incomplete)', 'incomplete'),
  ],
  '2B': [
    p('Person falls / padding', 'Anyone falls into the water or touches black padding. (60/RTB)', 'water'),
    p('Equipment falls water', 'Any equipment falls into the water. (60/RTT)', 'drop'),
    p('Dragging board bottom', 'Students drag board on bottom of pool instead of holding it. (60)', 'padding'),
    p('Supplies left barrow', 'Failure to keep supplies in the wheelbarrow. (60)', 'drop'),
    p('Missing all equipment', 'Not taking all equipment. (Incomplete)', 'incomplete'),
  ],
  '3B': [
    p('Touch red / padding', 'Anyone or equipment touches red area or black padding. (30)', 'red-any'),
    p('Rough explosives box', 'Roughly handling the box of explosives. (30)', 'rough'),
    p('Person touches water', 'Anyone touches the water. (60/RTB)', 'water'),
    p('Items fall water', 'Anything (keys, gravel, coins, etc) touches or is dropped in the water. (60/RTT)', 'drop'),
    p('Missing all equipment', 'Not taking all equipment. (Incomplete)', 'incomplete'),
  ],
  '4B': [
    p('Gear touches red', 'Equipment touches red, water, black padding, or the sensor field. (Except rope in minefield – if whole coil of rope falls in minefield that is a penalty) (30/RTT)', 'red-equip'),
    p('Items fall water', 'Anything (keys, gravel, coins, etc) falls into water. (30)', 'drop'),
    p('Person touches red', 'Anyone touches red, water, black padding, or the sensor field on the ground. (30/RTB)', 'red-person'),
  ],
  '5B': [
    p('Rough scientist handling', 'Roughly handling the scientist. (30)', 'rough'),
    p('Touch red area', 'Anyone or anything touches a red area (until alarm is repositioned). (30)', 'red-any'),
    p('Falls into water', 'Anyone/Anything falls into the water. (30/RTB/RTT)', 'water'),
    p('Touch mined / splash', 'Anyone touches the mined area, pool, or gets splashed (wet plank may be touched). (60)', 'mine'),
    p('Gear touches mine', 'Equipment touches mined area. (60)', 'mine'),
    p('Team not in room', "Entire team isn't in the chemical room when switch is turned off. (60)", 'noise'),
    p('Scientist not out', 'Not getting the scientist out of the plant. (Incomplete)', 'incomplete'),
  ],
  '6B': [
    p('Person touches red', 'Anyone (including the dummy) touches ground, black padding, red area, or falls into the water. (30/RTB)', 'red-person'),
    p('Rough dummy handling', 'Roughly handling the dummy (30)', 'rough'),
    p('Equipment falls water', 'Equipment falls into water. (30/RTT)', 'drop'),
    p('Talking too loud', 'Anyone talks loud enough to be heard by team members on the opposite platform. (60)', 'noise'),
    p('Solo dummy carry', 'A single person is carrying the dummy across the river (60/RTB for person and dummy)', 'carry'),
    p('Missing all equipment', 'Not taking all the equipment. (Incomplete)', 'incomplete'),
  ],
  '7B': [
    p('Touch acid / sensor', 'Anyone touches the acid, either side of the bath, or sensor field. (60)', 'acid'),
    p('Loud noise / whisper', 'Making a loud noise, dragging pipes, sliding cans along bottom of pool, or not whispering. (60)', 'noise'),
    p('Acid drips toes', 'Dripping acid across their toes. (60)', 'acid'),
    p('Dropped pipe control', 'Dropping (loses control of) pipe(s) (60 – do not return pipe to students)', 'drop'),
  ],
  '8B': [
    p('Person touches red', 'Anyone touches red or minefield. (60/RTB)', 'red-person'),
    p('Gear touches red', 'Equipment touches red or minefield. (The rope in a minefield is not a foul) (60)', 'red-equip'),
    p('Rough dummy handling', 'Roughly handling the dummy; not using the stretcher. (60)', 'rough'),
    p('Missing dummy taken', 'Failure to bring the dummy. (Incomplete)', 'incomplete'),
  ],
  '9B': [
    p('Person touches red', 'Anyone touches red or comes to rest on the ground. (60/RTB)', 'red-person'),
    p('Gear on ground', 'Equipment rests on the ground between the edges of the gorge. (Except if they intend to destroy equipment) (60/RTT)', 'mine'),
    p('Missing all equipment', 'Not taking or destroying equipment. (Incomplete)', 'incomplete'),
  ],
  '10B': [
    p('Person touches red', 'Anyone touches red, wire, or area between the red rails. (60/RTB)', 'red-person'),
    p('Gear touches red', 'Equipment touches red, wire, or area between the red rails. (60)', 'red-equip'),
    p('Rough dummy handling', 'Roughly handling dummy/removing the dummy from the stretcher. (60)', 'rough'),
    p('Missing dummy taken', 'Failure to bring the dummy. (Incomplete)', 'incomplete'),
  ],
  '11B': [
    p('Talking above whisper', 'Anyone talks above a whisper or makes a loud noise with equipment. (30)', 'noise'),
    p('Gear touches red', 'Anything (including ropes) touches red or the ground inside the red area. (60)', 'red-equip'),
    p('Person touches red', 'Anyone touches red or the ground inside the red area. (60/RTB)', 'red-person'),
    p('Missing drum taken', 'Failure to bring the drum. (Incomplete)', 'incomplete'),
  ],
  '12B': [
    p('Gear touches red', 'Equipment touches red or mined area. (60)', 'red-equip'),
    p('Person touches red', 'Anyone touches red, mined area, or electric cable. (60/RTB)', 'red-person'),
    p('Talking above whisper', 'Anyone talks above a whisper. (60)', 'noise'),
  ],
  '13B': [
    p('Person touches red', 'Anyone touches mined area or red. (30/RTB)', 'red-person'),
    p('Lost unrecovered rope', "The rope falls to the ground and can't be retrieved. (60/RTT)", 'drop'),
    p('Missing rope taken', "The team doesn't take the rope. (Incomplete)", 'incomplete'),
  ],
  '14B': [
    p('Gear touches red', 'Equipment touches red or mined area. (60)', 'red-equip'),
    p('Person touches red', 'Anyone touches red or mined area. (60/RTB)', 'red-person'),
    p('Box dragged mine', 'The box is dragged/dropped in the minefield. (60/RTB/RTT)', 'mine'),
    p('Missing all equipment', "The team doesn't take all equipment. (Incomplete)", 'incomplete'),
  ],
  '15B': [
    p('Person touches red', 'Anyone touches red or mined area. (30/RTB)', 'red-person'),
    p('Gear touches red', 'Anything touches red or mined area. (30)', 'red-equip'),
    p('Rough drum handling', 'Roughly handling the drum. (30)', 'rough'),
    p('Missing all equipment', 'The team fails to take all of the equipment. (Incomplete)', 'incomplete'),
  ],
  '16B': [
    p('Touch red / padding', 'Anyone or equipment, except rope, touches a red area or black padding. (30)', 'red-any'),
    p('Person falls water', 'Anyone touches or falls into the water. (30/RTB)', 'water'),
    p('Equipment falls water', 'Equipment falls into water (except if they intend to destroy equipment) (30/RTT)', 'drop'),
    p('Missing all equipment', 'Not taking or destroying equipment. (Incomplete)', 'incomplete'),
  ],
  '17B': [
    p('Person touches red', 'Anyone touches the water, black padding on edges of moat, red, or electric cable. (60/RTB)', 'red-person'),
    p('Gear touches padding', 'Any equipment touches black padding on edges of the moat. (60)', 'padding'),
    p('Board dropped water', 'Drops (loses control of) board in water. (60/RTT)', 'drop'),
    p('Drum touches red', 'The drum touches a red beam with a person touching the drum. (60/RTB) (Remove drum from beam after foul)', 'red-any'),
  ],
  '18B': [
    p('Person touches red', 'Anyone touches red, black padding, or falls into the water. (30/RTB)', 'red-person'),
    p('Gear touches red', 'Any equipment touches red, black padding, or falls into water. (30/RTT)', 'red-equip'),
    p('Missing all equipment', "They don't take the equipment. (Incomplete)", 'incomplete'),
  ],
  '19B': [
    p('Touch red / padding', 'Anyone or any equipment touches red or black padded area. (30)', 'red-any'),
    p('Touch mined area', 'Anyone or anything touches mined area. (30/RTB/RTT)', 'mine'),
    p('Person falls stream', 'Anyone falls into the water or stands on bottom of stream. (30/RTB)', 'water'),
    p('Equipment falls water', 'Equipment falls into the water. (60/RTT)', 'drop'),
    p('Rough box handling', 'Roughly handling or throwing the box. (60)', 'rough'),
    p('Missing all equipment', "They don't take all the equipment. (Incomplete)", 'incomplete'),
  ],
  '20B': [
    p('Person touches red', 'Anyone touches red, black padding, or falls into water. (30/RTB)', 'red-person'),
    p('Gear touches red', 'Anything touches red, black padding, or falls into the water (except the plank can fall into water if the rope is tied around it). (30/RTT)', 'red-equip'),
    p('Missing all equipment', 'Not taking all equipment. (Incomplete)', 'incomplete'),
  ],
  '21B': [
    p('Person touches red', 'Anyone touches red, black padding, or falls into the water. (30/RTB)', 'red-person'),
    p('Gear touches red', 'Equipment touches red or black padding. (30)', 'red-equip'),
    p('Equipment falls water', 'Equipment falls in the water. (60/RTT)', 'drop'),
  ],
  '22B': [
    p('Person touches red', 'Anyone touches red, black padding, or mined area. (30/RTB)', 'red-person'),
    p('Gear touches red', 'Equipment touches red, black padding, or mined area. (30/RTT)', 'red-equip'),
    p('Rough ammo boxes', 'Rough handling of the ammo boxes. (30)', 'rough'),
    p('Missing ammo boxes', 'Failure to bring ammo boxes. (Incomplete)', 'incomplete'),
  ],
}

export function penaltiesForTask(taskCode) {
  const code = String(taskCode || '').trim().toUpperCase()
  return TASK_PENALTIES[code] || []
}
